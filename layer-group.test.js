import { describe, expect, test } from 'bun:test';
import {
  MAX_GROUPS, blockRange, boundingBox, deriveGroupPlacements, dissolveEmptyGroups, groupErrors, groupLayers, isEffectivelyLocked, isEffectivelyVisible, isGroup,
  membersOf, topLevelLayers, ungroupLayers,
} from './layer-group.js';

const at = (x, y, width, height) => ({ x, y, width, height });
const layer = (id, extra = {}) => ({ id, kind: 'text', visible: true, opacity: 1, placement: at(0, 0, 1, 1), options: {}, ...extra });
const group = (id, extra = {}) => ({ id, kind: 'group', visible: true, opacity: 1, placement: at(0, 0, 1, 1), options: {}, ...extra });
const ids = (layers) => layers.map(({ id }) => id);

describe('structure helpers', () => {
  const layers = [layer('a'), layer('b', { group: 'g' }), layer('c', { group: 'g' }), group('g'), layer('d')];

  test('isGroup recognises the group entry only', () => {
    expect(layers.map(isGroup)).toEqual([false, false, false, true, false]);
  });

  test('membersOf returns the members back to front', () => {
    expect(ids(membersOf(layers, 'g'))).toEqual(['b', 'c']);
    expect(membersOf(layers, 'nope')).toEqual([]);
  });

  test('topLevelLayers keeps groups and ungrouped layers, not members', () => {
    expect(ids(topLevelLayers(layers))).toEqual(['a', 'g', 'd']);
  });

  test('blockRange spans a group from its first member to the group entry, from any of its entries', () => {
    expect(blockRange(layers, 'g')).toEqual({ start: 1, end: 3 });
    expect(blockRange(layers, 'b')).toEqual({ start: 1, end: 3 });
    expect(blockRange(layers, 'c')).toEqual({ start: 1, end: 3 });
  });

  test('blockRange of an ungrouped layer is itself; an unknown id has none', () => {
    expect(blockRange(layers, 'a')).toEqual({ start: 0, end: 0 });
    expect(blockRange(layers, 'd')).toEqual({ start: 4, end: 4 });
    expect(blockRange(layers, 'nope')).toBeNull();
  });
});

describe('boundingBox and derived placement', () => {
  test('the bounding box covers every placement', () => {
    expect(boundingBox([at(0.1, 0.2, 0.3, 0.1), at(0.5, 0.1, 0.2, 0.6)])).toEqual({ x: 0.1, y: 0.1, width: 0.6, height: 0.6 });
    // Sums of fractions leave no float noise in the box.
    expect(boundingBox([at(0.2, 0.2, 0.4, 0.4)])).toEqual(at(0.2, 0.2, 0.4, 0.4));
    expect(boundingBox([at(0.25, 0.25, 0.5, 0.5)])).toEqual(at(0.25, 0.25, 0.5, 0.5));
  });

  test('a group takes the box of its members, whatever it held before', () => {
    const layers = [layer('a', { group: 'g', placement: at(0.1, 0.1, 0.2, 0.2) }), layer('b', { group: 'g', placement: at(0.5, 0.4, 0.3, 0.1) }), group('g', { placement: at(0, 0, 1, 1) })];
    expect(deriveGroupPlacements(layers)[2].placement).toEqual(boundingBox([at(0.1, 0.1, 0.2, 0.2), at(0.5, 0.4, 0.3, 0.1)]));
  });

  test('entries that do not change keep their identity; layers are never touched', () => {
    const members = [layer('a', { group: 'g', placement: at(0.2, 0.2, 0.4, 0.4) })];
    const settled = [...members, group('g', { placement: at(0.2, 0.2, 0.4, 0.4) })];
    const result = deriveGroupPlacements(settled);
    expect(result[0]).toBe(settled[0]);
    expect(result[1]).toBe(settled[1]);
  });

  test('an empty group keeps its placement (validation refuses it)', () => {
    const empty = group('g', { placement: at(0.3, 0.3, 0.1, 0.1) });
    expect(deriveGroupPlacements([empty])[0]).toBe(empty);
  });

  test('the input is not modified', () => {
    const layers = [layer('a', { group: 'g', placement: at(0.2, 0.2, 0.4, 0.4) }), group('g')];
    const before = JSON.stringify(layers);
    deriveGroupPlacements(layers);
    expect(JSON.stringify(layers)).toBe(before);
  });
});

describe('groupErrors', () => {
  test('a well-formed scene has no defect, with or without groups', () => {
    expect(groupErrors([layer('a'), layer('b', { group: 'g' }), group('g'), layer('c')])).toEqual([]);
    expect(groupErrors([layer('a'), layer('b')])).toEqual([]);
    expect(groupErrors([])).toEqual([]);
  });

  test('a group inside a group is refused', () => {
    const errors = groupErrors([layer('a', { group: 'inner' }), group('inner', { group: 'outer' }), group('outer')]);
    expect(errors).toContain('layers[inner].group : un groupe ne se range pas dans un groupe');
  });

  test('a layer pointing at a missing group, or at a layer that is not a group, is refused', () => {
    expect(groupErrors([layer('a', { group: 'ghost' })])).toEqual(['layers[a].group : groupe « ghost » introuvable']);
    expect(groupErrors([layer('a'), layer('b', { group: 'a' })])).toEqual(['layers[b].group : groupe « a » introuvable']);
  });

  test('an identity layer cannot be in a group', () => {
    const errors = groupErrors([{ ...layer('brand'), kind: 'branding', group: 'g' }, group('g')]);
    expect(errors).toEqual(['layers[brand].group : une couche d’identité ne se groupe pas']);
  });

  test('a group without members is refused', () => {
    expect(groupErrors([layer('a'), group('g')])).toEqual(['layers[g] : un groupe contient au moins une couche']);
  });

  test('a block must be contiguous and end with the group entry', () => {
    const apart = groupErrors([layer('a', { group: 'g' }), layer('x'), layer('b', { group: 'g' }), group('g')]);
    expect(apart).toEqual(['layers[g] : les couches d’un groupe se suivent, juste avant lui']);
    const after = groupErrors([group('g'), layer('a', { group: 'g' })]);
    expect(after).toEqual(['layers[g] : les couches d’un groupe se suivent, juste avant lui']);
  });

  test('at most MAX_GROUPS groups', () => {
    const many = Array.from({ length: MAX_GROUPS + 1 }, (_, index) => [layer(`m${index}`, { group: `g${index}` }), group(`g${index}`)]).flat();
    expect(groupErrors(many)).toEqual([`layers : ${MAX_GROUPS} groupes au plus`]);
    expect(groupErrors(many.slice(0, MAX_GROUPS * 2))).toEqual([]);
  });
});

describe('groupLayers', () => {
  const base = [layer('a', { placement: at(0, 0, 0.2, 0.2) }), layer('b', { placement: at(0.5, 0.5, 0.3, 0.3) }), layer('c'), layer('d')];

  test('the members and the group form a block placed after the top-most selected layer', () => {
    const result = groupLayers(base, ['a', 'c'], { id: 'g', name: 'Titre' });
    expect(ids(result)).toEqual(['b', 'a', 'c', 'g', 'd']);
    expect(result.find(({ id }) => id === 'g')).toMatchObject({ kind: 'group', name: 'Titre', visible: true, opacity: 1, options: {} });
    expect(membersOf(result, 'g').map(({ id }) => id)).toEqual(['a', 'c']);
  });

  test('members keep their back-to-front order, whatever the order of the ids', () => {
    expect(ids(groupLayers(base, ['c', 'a'], { id: 'g' }))).toEqual(['b', 'a', 'c', 'g', 'd']);
  });

  test('the group box covers its members; layers are not moved', () => {
    const result = groupLayers(base, ['a', 'b'], { id: 'g' });
    expect(result.find(({ id }) => id === 'g').placement).toEqual({ x: 0, y: 0, width: 0.8, height: 0.8 });
    expect(result.find(({ id }) => id === 'a').placement).toEqual(at(0, 0, 0.2, 0.2));
  });

  test('the result is valid', () => {
    for (const selection of [['a'], ['a', 'b'], ['b', 'd'], ['a', 'b', 'c', 'd']]) expect(groupErrors(groupLayers(base, selection, { id: 'g' }))).toEqual([]);
  });

  test('a layer taken out of a group leaves it; the group stays when others remain', () => {
    const layers = [layer('a', { group: 'g' }), layer('b', { group: 'g' }), group('g'), layer('c')];
    const result = groupLayers(layers, ['a', 'c'], { id: 'h' });
    expect(membersOf(result, 'g').map(({ id }) => id)).toEqual(['b']);
    expect(membersOf(result, 'h').map(({ id }) => id)).toEqual(['a', 'c']);
    expect(groupErrors(result)).toEqual([]);
    expect(result.find(({ id }) => id === 'h')).toBeDefined();
  });

  test('the old group box shrinks to the members that remain', () => {
    const layers = [layer('a', { group: 'g', placement: at(0, 0, 0.2, 0.2) }), layer('b', { group: 'g', placement: at(0.6, 0.6, 0.2, 0.2) }), group('g', { placement: at(0, 0, 0.8, 0.8) }), layer('c')];
    const result = groupLayers(layers, ['a', 'c'], { id: 'h' });
    expect(result.find(({ id }) => id === 'g').placement).toEqual(at(0.6, 0.6, 0.2, 0.2));
    expect(result.find(({ id }) => id === 'h').placement).toEqual(boundingBox([at(0, 0, 0.2, 0.2), at(0, 0, 1, 1)]));
  });

  test('a single layer taken from the top of a group goes above that group, not into its block', () => {
    const layers = [layer('a', { group: 'g' }), layer('b', { group: 'g' }), group('g'), layer('c')];
    const result = groupLayers(layers, ['b'], { id: 'h' });
    expect(ids(result)).toEqual(['a', 'g', 'b', 'h', 'c']);
    expect(groupErrors(result)).toEqual([]);
  });

  test('an old group left without members is dissolved', () => {
    const layers = [layer('a', { group: 'g' }), group('g'), layer('c')];
    const result = groupLayers(layers, ['a', 'c'], { id: 'h' });
    expect(ids(result)).toEqual(['a', 'c', 'h']);
    expect(groupErrors(result)).toEqual([]);
  });

  test('when the top-most selected layer is inside a group, the new block goes above that group', () => {
    const layers = [layer('a', { group: 'g' }), layer('b', { group: 'g' }), group('g'), layer('c')];
    const result = groupLayers(layers, ['a', 'c'], { id: 'h' });
    expect(ids(result)).toEqual(['b', 'g', 'a', 'c', 'h']);
  });

  test('nothing valid to group gives null: unknown id, a group, an identity layer, an empty selection, a taken id', () => {
    const withGroup = [layer('a', { group: 'g' }), group('g'), layer('b'), { ...layer('brand'), kind: 'branding' }];
    expect(groupLayers(withGroup, [], { id: 'h' })).toBeNull();
    expect(groupLayers(withGroup, ['ghost'], { id: 'h' })).toBeNull();
    expect(groupLayers(withGroup, ['a', 'ghost'], { id: 'h' })).toBeNull();
    expect(groupLayers(withGroup, ['g'], { id: 'h' })).toBeNull();
    expect(groupLayers(withGroup, ['brand'], { id: 'h' })).toBeNull();
    expect(groupLayers(withGroup, ['b'], { id: 'a' })).toBeNull();
  });

  test('the group limit', () => {
    const full = Array.from({ length: MAX_GROUPS }, (_, index) => [layer(`m${index}`, { group: `g${index}` }), group(`g${index}`)]).flat();
    expect(groupLayers([...full, layer('free')], ['free'], { id: 'extra' })).toBeNull();
  });

  test('the input is not modified', () => {
    const before = JSON.stringify(base);
    groupLayers(base, ['a', 'c'], { id: 'g' });
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe('ungroupLayers', () => {
  const layers = [layer('a', { group: 'g' }), layer('b', { group: 'g' }), group('g', { opacity: 0.5 }), layer('c')];

  test('members stay where they are, free; the group entry goes with its look', () => {
    const result = ungroupLayers(layers, 'g');
    expect(ids(result)).toEqual(['a', 'b', 'c']);
    expect(result.every((entry) => entry.group === undefined && !('group' in entry))).toBe(true);
    expect(groupErrors(result)).toEqual([]);
  });

  test('a layer that is not a group, or an unknown id, gives null', () => {
    expect(ungroupLayers(layers, 'a')).toBeNull();
    expect(ungroupLayers(layers, 'nope')).toBeNull();
  });

  test('the input is not modified', () => {
    const before = JSON.stringify(layers);
    ungroupLayers(layers, 'g');
    expect(JSON.stringify(layers)).toBe(before);
  });
});

describe('dissolveEmptyGroups', () => {
  test('a group without members goes; others stay', () => {
    const layers = [layer('a', { group: 'g' }), group('g'), group('empty'), layer('c')];
    expect(ids(dissolveEmptyGroups(layers))).toEqual(['a', 'g', 'c']);
  });

  test('a member pointing at nothing becomes free', () => {
    const result = dissolveEmptyGroups([layer('a', { group: 'ghost' })]);
    expect(result).toEqual([layer('a')]);
    expect('group' in result[0]).toBe(false);
  });

  test('a valid scene is returned equal', () => {
    const layers = [layer('a', { group: 'g' }), group('g')];
    expect(dissolveEmptyGroups(layers)).toEqual(layers);
  });
});

describe('effective visibility and lock', () => {
  const layers = [layer('a', { group: 'g' }), layer('b', { group: 'g', visible: false }), group('g'), layer('c')];

  test('a layer of a hidden group is hidden, a hidden layer stays hidden', () => {
    expect(isEffectivelyVisible(layers, layers[0])).toBe(true);
    expect(isEffectivelyVisible(layers, layers[1])).toBe(false);
    const hiddenGroup = layers.map((entry) => (entry.id === 'g' ? { ...entry, visible: false } : entry));
    expect(isEffectivelyVisible(hiddenGroup, hiddenGroup[0])).toBe(false);
    expect(isEffectivelyVisible(hiddenGroup, hiddenGroup[3])).toBe(true);
  });

  test('a layer of a locked group is locked', () => {
    expect(isEffectivelyLocked(layers, layers[0])).toBe(false);
    const locked = layers.map((entry) => (entry.id === 'g' ? { ...entry, locked: true } : entry));
    expect(isEffectivelyLocked(locked, locked[0])).toBe(true);
    expect(isEffectivelyLocked(locked, locked[3])).toBe(false);
    expect(isEffectivelyLocked(layers.map((entry) => (entry.id === 'c' ? { ...entry, locked: true } : entry)), { ...layers[3], locked: true })).toBe(true);
  });
});
