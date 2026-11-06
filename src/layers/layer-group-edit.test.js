import { describe, expect, test } from 'bun:test';
import { boundingBox, fitPlacement, reorderItems, resizeGroup, selectionRoots, topLevelBlocks, withMembers } from './layer-group.js';

const at = (x, y, width, height) => ({ x, y, width, height });
const layer = (id, extra = {}) => ({ id, kind: 'text', visible: true, opacity: 1, placement: at(0, 0, 1, 1), options: {}, ...extra });
const group = (id, extra = {}) => ({ id, kind: 'group', visible: true, opacity: 1, placement: at(0, 0, 1, 1), options: {}, ...extra });
const ids = (layers) => layers.map(({ id }) => id);

describe('selectionRoots', () => {
  const layers = [layer('a', { group: 'g' }), layer('b', { group: 'g' }), group('g'), layer('c')];

  test('a layer whose group is also selected is left out', () => {
    expect(selectionRoots(layers, ['a', 'g', 'c'])).toEqual(['g', 'c']);
  });

  test('a member alone stays, in scene order', () => {
    expect(selectionRoots(layers, ['b', 'a'])).toEqual(['a', 'b']);
  });

  test('unknown ids are ignored; nothing selected gives nothing', () => {
    expect(selectionRoots(layers, ['nope', 'c'])).toEqual(['c']);
    expect(selectionRoots(layers, [])).toEqual([]);
  });
});

describe('withMembers', () => {
  const layers = [layer('a', { group: 'g' }), layer('b', { group: 'g' }), group('g'), layer('c'), layer('d', { group: 'h' }), group('h')];

  test('a group brings its members, in scene order', () => {
    expect(withMembers(layers, ['g'])).toEqual(['a', 'b', 'g']);
    expect(withMembers(layers, ['h', 'c'])).toEqual(['c', 'd', 'h']);
  });

  test('other ids are unchanged', () => {
    expect(withMembers(layers, ['a', 'c'])).toEqual(['a', 'c']);
    expect(withMembers(layers, [])).toEqual([]);
  });
});

describe('fitPlacement', () => {
  const from = at(0.2, 0.2, 0.4, 0.4);

  test('the same box changes nothing', () => {
    expect(fitPlacement(at(0.3, 0.3, 0.1, 0.1), from, from)).toEqual(at(0.3, 0.3, 0.1, 0.1));
  });

  test('a translation moves the placement by the same amount', () => {
    const moved = fitPlacement(at(0.3, 0.3, 0.1, 0.1), from, at(0.5, 0.1, 0.4, 0.4));
    expect(moved.x).toBeCloseTo(0.6, 9);
    expect(moved.y).toBeCloseTo(0.2, 9);
    expect(moved.width).toBeCloseTo(0.1, 9);
  });

  test('the two axes scale on their own', () => {
    const inner = fitPlacement(at(0.4, 0.4, 0.1, 0.1), from, at(0, 0, 0.8, 0.2));
    expect(inner.x).toBeCloseTo(0.4, 9);
    expect(inner.y).toBeCloseTo(0.1, 9);
    expect(inner.width).toBeCloseTo(0.2, 9);
    expect(inner.height).toBeCloseTo(0.05, 9);
  });

  test('a scale carries the placement with the box: the corners of the box map to the corners of the new box', () => {
    const to = at(0, 0, 0.8, 0.2);
    expect(fitPlacement(from, from, to)).toEqual(to);
    const inner = fitPlacement(at(0.4, 0.2, 0.2, 0.2), from, to);
    expect(inner.x).toBeCloseTo(0.4, 9);
    expect(inner.width).toBeCloseTo(0.4, 9);
    expect(inner.height).toBeCloseTo(0.1, 9);
  });
});

describe('resizeGroup', () => {
  const layers = () => [layer('a', { group: 'g', placement: at(0.2, 0.2, 0.2, 0.2) }), layer('b', { group: 'g', placement: at(0.6, 0.5, 0.2, 0.3) }), group('g', { placement: at(0.2, 0.2, 0.6, 0.6) }), layer('c', { placement: at(0.9, 0.9, 0.1, 0.1) })];

  test('moving the box moves every member and the group follows', () => {
    const result = resizeGroup(layers(), 'g', at(0.3, 0.1, 0.6, 0.6));
    const byId = Object.fromEntries(result.map((entry) => [entry.id, entry.placement]));
    expect(byId.a.x).toBeCloseTo(0.3, 6);
    expect(byId.a.y).toBeCloseTo(0.1, 6);
    expect(byId.b.x).toBeCloseTo(0.7, 6);
    expect(byId.g).toEqual(at(0.3, 0.1, 0.6, 0.6));
  });

  test('resizing scales members and their distances', () => {
    const result = resizeGroup(layers(), 'g', at(0.2, 0.2, 0.3, 0.3));
    const byId = Object.fromEntries(result.map((entry) => [entry.id, entry.placement]));
    expect(byId.a.width).toBeCloseTo(0.1, 6);
    expect(byId.b.x).toBeCloseTo(0.2 + 0.4 * 0.5, 6);
    expect(byId.b.height).toBeCloseTo(0.15, 6);
    expect(byId.g).toEqual(at(0.2, 0.2, 0.3, 0.3));
  });

  test('layers outside the group are not touched', () => {
    const before = layers();
    const result = resizeGroup(before, 'g', at(0.5, 0.5, 0.2, 0.2));
    expect(result[3]).toBe(before[3]);
  });

  test('setting the same box leaves the members as they are', () => {
    const before = layers();
    const result = resizeGroup(before, 'g', boundingBox([at(0.2, 0.2, 0.2, 0.2), at(0.6, 0.5, 0.2, 0.3)]));
    expect(result.map(({ placement }) => placement)).toEqual(before.map(({ placement }) => placement));
  });

  test('a box with no area, an unknown id, a layer that is not a group, a group without members: null', () => {
    expect(resizeGroup(layers(), 'g', at(0, 0, 0, 0.5))).toBeNull();
    expect(resizeGroup(layers(), 'g', at(0, 0, 0.5, -1))).toBeNull();
    expect(resizeGroup(layers(), 'nope', at(0, 0, 1, 1))).toBeNull();
    expect(resizeGroup(layers(), 'a', at(0, 0, 1, 1))).toBeNull();
    expect(resizeGroup([group('g')], 'g', at(0, 0, 1, 1))).toBeNull();
  });

  test('the input is not modified', () => {
    const before = layers();
    const copy = JSON.stringify(before);
    resizeGroup(before, 'g', at(0, 0, 0.3, 0.3));
    expect(JSON.stringify(before)).toBe(copy);
  });
});

describe('reorderItems', () => {
  const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  const order = (result) => result.map(({ id }) => id).join('');

  test('up swaps each target with its neighbour in front, down with the one behind', () => {
    expect(order(reorderItems(items, ['b'], 'up'))).toBe('acbd');
    expect(order(reorderItems(items, ['c'], 'down'))).toBe('acbd');
    expect(order(reorderItems(items, ['a', 'b'], 'up'))).toBe('cabd');
  });

  test('a target already at the end stays; two adjacent targets move together', () => {
    expect(order(reorderItems(items, ['d'], 'up'))).toBe('abcd');
    expect(order(reorderItems(items, ['a'], 'down'))).toBe('abcd');
    expect(order(reorderItems(items, ['b', 'c'], 'down'))).toBe('bcad');
  });

  test('top and bottom gather the targets', () => {
    expect(order(reorderItems(items, ['b', 'd'], 'top'))).toBe('acbd');
    expect(order(reorderItems(items, ['b', 'd'], 'bottom'))).toBe('bdac');
  });

  test('to places the targets among the items that stay, bounded', () => {
    expect(order(reorderItems(items, ['a'], { to: 2 }))).toBe('bcad');
    expect(order(reorderItems(items, ['a'], { to: 99 }))).toBe('bcda');
    expect(order(reorderItems(items, ['d'], { to: -5 }))).toBe('dabc');
    expect(order(reorderItems(items, ['d'], { to: -1 }))).toBe('dabc');
  });

  test('the input is not modified', () => {
    const copy = JSON.stringify(items);
    reorderItems(items, ['b'], 'up');
    expect(JSON.stringify(items)).toBe(copy);
  });
});

describe('topLevelBlocks', () => {
  test('a group is a block with its members, a free layer a block alone', () => {
    const layers = [layer('a'), layer('b', { group: 'g' }), layer('c', { group: 'g' }), group('g'), layer('d')];
    const blocks = topLevelBlocks(layers);
    expect(blocks.map(({ id }) => id)).toEqual(['a', 'g', 'd']);
    expect(blocks.map((block) => ids(block.layers))).toEqual([['a'], ['b', 'c', 'g'], ['d']]);
  });
});
