import { describe, expect, test } from 'bun:test';
import { targetLayer } from './background-preview-controller.js';

const scene = (layers) => ({ version: 1, id: 's', name: 's', layers });
const layer = (id, kind, extra = {}) => ({ id, kind, visible: true, placement: { x: 0, y: 0, width: 1, height: 1 }, ...extra });

describe('targetLayer', () => {
  const layers = [layer('a', 'text', { group: 'g' }), layer('g', 'group'), layer('b', 'text')];

  test('a selected group is never the layer the effect panel sets', () => {
    expect(targetLayer(scene(layers), ['g'])?.id).toBe('a');
  });

  test('the last selected effect layer wins', () => {
    expect(targetLayer(scene(layers), ['a', 'g', 'b'])?.id).toBe('b');
  });

  test('a scene of groups only has no target', () => {
    expect(targetLayer(scene([layer('g', 'group')]), ['g'])).toBeNull();
  });
});
