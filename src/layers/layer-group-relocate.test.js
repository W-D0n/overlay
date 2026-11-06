import { describe, expect, test } from 'bun:test';
import { groupErrors, relocateLayers } from './layer-group.js';

const at = (x, y, width, height) => ({ x, y, width, height });
const layer = (id, extra = {}) => ({ id, kind: 'text', visible: true, opacity: 1, placement: at(0, 0, 1, 1), options: {}, ...extra });
const group = (id, extra = {}) => ({ id, kind: 'group', visible: true, opacity: 1, placement: at(0, 0, 1, 1), options: {}, ...extra });
const ids = (layers) => layers.map(({ id }) => id);
const owner = (layers, id) => layers.find((entry) => entry.id === id).group;

/** Back to front: a and b in g, then c, then d and e in h, then f. */
const scene = () => [layer('a', { group: 'g' }), layer('b', { group: 'g' }), group('g'), layer('c'), layer('d', { group: 'h' }), layer('e', { group: 'h' }), group('h'), layer('f')];

describe('dropping next to a member of a group', () => {
  test('a free layer dropped in front of a member joins the group, right in front of it', () => {
    const result = relocateLayers(scene(), ['c'], { beside: 'a', side: 'front' });
    expect(ids(result)).toEqual(['a', 'c', 'b', 'g', 'd', 'e', 'h', 'f']);
    expect(owner(result, 'c')).toBe('g');
    expect(groupErrors(result)).toEqual([]);
  });

  test('behind a member, it goes right behind it', () => {
    const result = relocateLayers(scene(), ['c'], { beside: 'a', side: 'back' });
    expect(ids(result)).toEqual(['c', 'a', 'b', 'g', 'd', 'e', 'h', 'f']);
    expect(owner(result, 'c')).toBe('g');
  });

  test('a member of another group changes group', () => {
    const result = relocateLayers(scene(), ['d'], { beside: 'b', side: 'front' });
    expect(ids(result)).toEqual(['a', 'b', 'd', 'g', 'c', 'e', 'h', 'f']);
    expect(owner(result, 'd')).toBe('g');
    expect(owner(result, 'e')).toBe('h');
    expect(groupErrors(result)).toEqual([]);
  });

  test('a member moved within its own group stays in it', () => {
    const result = relocateLayers(scene(), ['a'], { beside: 'b', side: 'front' });
    expect(ids(result)).toEqual(['b', 'a', 'g', 'c', 'd', 'e', 'h', 'f']);
    expect(owner(result, 'a')).toBe('g');
  });
});

describe('dropping into a group', () => {
  test('a layer goes to the front of the members', () => {
    const result = relocateLayers(scene(), ['c'], { into: 'g' });
    expect(ids(result)).toEqual(['a', 'b', 'c', 'g', 'd', 'e', 'h', 'f']);
    expect(owner(result, 'c')).toBe('g');
    expect(groupErrors(result)).toEqual([]);
  });

  test('several layers keep their order', () => {
    const result = relocateLayers(scene(), ['c', 'f'], { into: 'g' });
    expect(ids(result)).toEqual(['a', 'b', 'c', 'f', 'g', 'd', 'e', 'h']);
    expect(owner(result, 'f')).toBe('g');
  });

  test('a group cannot be dropped into a group', () => {
    expect(relocateLayers(scene(), ['h'], { into: 'g' })).toBeNull();
  });

  test('a layer that is not a group cannot be dropped into', () => {
    expect(relocateLayers(scene(), ['f'], { into: 'c' })).toBeNull();
  });

  test('the group box grows with the new member', () => {
    const layers = [layer('a', { group: 'g', placement: at(0, 0, 0.2, 0.2) }), group('g', { placement: at(0, 0, 0.2, 0.2) }), layer('c', { placement: at(0.6, 0.6, 0.2, 0.2) })];
    const result = relocateLayers(layers, ['c'], { into: 'g' });
    expect(result.find(({ id }) => id === 'g').placement).toEqual(at(0, 0, 0.8, 0.8));
  });
});

describe('dropping next to a free layer or a group', () => {
  test('a member dropped beside a free layer leaves its group', () => {
    const result = relocateLayers(scene(), ['a'], { beside: 'c', side: 'front' });
    expect(ids(result)).toEqual(['b', 'g', 'c', 'a', 'd', 'e', 'h', 'f']);
    expect(owner(result, 'a')).toBeUndefined();
    expect('group' in result.find(({ id }) => id === 'a')).toBe(false);
    expect(groupErrors(result)).toEqual([]);
  });

  test('a free layer dropped beside a group goes beside its whole block, not into it', () => {
    const front = relocateLayers(scene(), ['f'], { beside: 'g', side: 'front' });
    expect(ids(front)).toEqual(['a', 'b', 'g', 'f', 'c', 'd', 'e', 'h']);
    expect(owner(front, 'f')).toBeUndefined();
    const back = relocateLayers(scene(), ['f'], { beside: 'g', side: 'back' });
    expect(ids(back)).toEqual(['f', 'a', 'b', 'g', 'c', 'd', 'e', 'h']);
  });

  test('a group dropped beside a free layer moves as a block', () => {
    const result = relocateLayers(scene(), ['g'], { beside: 'f', side: 'front' });
    expect(ids(result)).toEqual(['c', 'd', 'e', 'h', 'f', 'a', 'b', 'g']);
    expect(groupErrors(result)).toEqual([]);
  });

  test('a group dropped beside a member of another group goes beside that group\'s block', () => {
    const result = relocateLayers(scene(), ['g'], { beside: 'd', side: 'front' });
    expect(ids(result)).toEqual(['c', 'd', 'e', 'h', 'a', 'b', 'g', 'f']);
    const back = relocateLayers(scene(), ['h'], { beside: 'a', side: 'back' });
    expect(ids(back)).toEqual(['d', 'e', 'h', 'a', 'b', 'g', 'c', 'f']);
    expect(groupErrors(back)).toEqual([]);
  });

  test('a group selected with its member moves as the group', () => {
    const result = relocateLayers(scene(), ['g', 'a'], { beside: 'f', side: 'front' });
    expect(ids(result)).toEqual(['c', 'd', 'e', 'h', 'f', 'a', 'b', 'g']);
    expect(owner(result, 'a')).toBe('g');
  });
});

describe('groups that lose their members', () => {
  test('a group left empty is dissolved', () => {
    const layers = [layer('a', { group: 'g' }), group('g'), layer('c')];
    const result = relocateLayers(layers, ['a'], { beside: 'c', side: 'front' });
    expect(ids(result)).toEqual(['c', 'a']);
  });

  test('the box of a group shrinks to the members that stay', () => {
    const layers = [layer('a', { group: 'g', placement: at(0, 0, 0.2, 0.2) }), layer('b', { group: 'g', placement: at(0.6, 0.6, 0.2, 0.2) }), group('g'), layer('c')];
    const result = relocateLayers(layers, ['a'], { beside: 'c', side: 'front' });
    expect(result.find(({ id }) => id === 'g').placement).toEqual(at(0.6, 0.6, 0.2, 0.2));
  });
});

describe('drops that make no sense', () => {
  test('nothing dragged, an unknown layer, an unknown target', () => {
    expect(relocateLayers(scene(), [], { beside: 'c', side: 'front' })).toBeNull();
    expect(relocateLayers(scene(), ['ghost'], { beside: 'c', side: 'front' })).toBeNull();
    expect(relocateLayers(scene(), ['c'], { beside: 'ghost', side: 'front' })).toBeNull();
  });

  test('the target is among the dragged layers, or inside a dragged group', () => {
    expect(relocateLayers(scene(), ['c'], { beside: 'c', side: 'front' })).toBeNull();
    expect(relocateLayers(scene(), ['g'], { beside: 'a', side: 'front' })).toBeNull();
    expect(relocateLayers(scene(), ['g'], { into: 'g' })).toBeNull();
  });

  test('an identity layer is neither dragged nor a target', () => {
    const branding = { ...layer('brand'), kind: 'branding' };
    expect(relocateLayers([...scene(), branding], ['brand'], { beside: 'c', side: 'front' })).toBeNull();
    expect(relocateLayers([...scene(), branding], ['c'], { beside: 'brand', side: 'back' })).toBeNull();
  });

  test('every successful drop leaves a valid structure', () => {
    const targets = ['a', 'b', 'g', 'c', 'd', 'e', 'h', 'f'];
    for (const dragged of [['a'], ['c'], ['g'], ['h'], ['a', 'd'], ['c', 'f']]) {
      for (const id of targets) {
        for (const side of ['front', 'back']) {
          const result = relocateLayers(scene(), dragged, { beside: id, side });
          if (result !== null) expect(groupErrors(result)).toEqual([]);
        }
        const into = relocateLayers(scene(), dragged, { into: id });
        if (into !== null) expect(groupErrors(into)).toEqual([]);
      }
    }
  });

  test('the input is not modified', () => {
    const before = scene();
    const copy = JSON.stringify(before);
    relocateLayers(before, ['c', 'a'], { into: 'h' });
    expect(JSON.stringify(before)).toBe(copy);
  });
});
