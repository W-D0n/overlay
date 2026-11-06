import { describe, expect, test } from 'bun:test';
import { layersToCopy } from './layer-group.js';

const at = { x: 0, y: 0, width: 1, height: 1 };
const layer = (id, extra = {}) => ({ id, kind: 'text', visible: true, placement: at, ...extra });
const layers = [layer('a', { group: 'g' }), layer('b', { group: 'g' }), { ...layer('g'), kind: 'group' }, layer('c')];

describe('layersToCopy', () => {
  test('a group goes with its members, in scene order, group links kept', () => {
    const copied = layersToCopy(layers, ['g']);
    expect(copied.map(({ id }) => id)).toEqual(['a', 'b', 'g']);
    expect(copied.filter(({ id }) => id !== 'g').every(({ group }) => group === 'g')).toBe(true);
  });

  test('a member alone is copied as a free layer: the copy is a valid scene of its own', () => {
    const copied = layersToCopy(layers, ['a']);
    expect(copied).toHaveLength(1);
    expect('group' in copied[0]).toBe(false);
  });

  test('free layers pass unchanged', () => {
    expect(layersToCopy(layers, ['c'])).toEqual([layers[3]]);
  });
});
