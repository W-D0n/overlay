// @ts-check
import { test, expect } from 'bun:test';
import { applyPlacementToLayer } from './scene-placement-format.js';

/** @returns {import('../types.js').SceneConfig} */
function buildFixture() {
  return {
    id: 'discussion',
    dotgridMode: 'discussion',
    transition: { type: 'crossfade', duration: 400, easing: 'easeInOut' },
    layers: [
      { name: 'goldbar', components: [{ component: 'GoldBar', options: {} }], visibility: { full: true, minimal: true, hidden: false } },
      { name: 'cam', components: [], visibility: { full: true, minimal: false, hidden: false }, placement: { x: 40, y: 40, width: 1080, height: 960 } },
      { name: 'subject', components: [], visibility: { full: true, minimal: false, hidden: false } },
    ],
  };
}

test('applyPlacementToLayer replaces only the targeted layer placement, preserves the rest', () => {
  const fixture = buildFixture();
  const updated = applyPlacementToLayer(fixture, 'cam', { x: 100, y: 200, width: 500, height: 600 });

  expect(updated.layers.find((l) => l.name === 'cam').placement).toEqual({ x: 100, y: 200, width: 500, height: 600 });
  expect(updated.layers.find((l) => l.name === 'goldbar')).toEqual(fixture.layers[0]); // inchangé
  expect(updated.layers.find((l) => l.name === 'subject').placement).toBeUndefined(); // toujours pas migrée
});

test('applyPlacementToLayer preserves top-level SceneConfig fields', () => {
  const fixture = buildFixture();
  const updated = applyPlacementToLayer(fixture, 'cam', { x: 1, y: 1 });
  expect(updated.id).toBe('discussion');
  expect(updated.dotgridMode).toBe('discussion');
  expect(updated.transition).toEqual(fixture.transition);
});

test('applyPlacementToLayer throws if the layer has no existing placement', () => {
  const fixture = buildFixture();
  expect(() => applyPlacementToLayer(fixture, 'subject', { x: 0, y: 0 })).toThrow();
});

test('applyPlacementToLayer throws if the layer name does not exist', () => {
  const fixture = buildFixture();
  expect(() => applyPlacementToLayer(fixture, 'nope', { x: 0, y: 0 })).toThrow();
});

test('applyPlacementToLayer does not mutate the input object', () => {
  const fixture = buildFixture();
  const before = JSON.stringify(fixture);
  applyPlacementToLayer(fixture, 'cam', { x: 1, y: 1 });
  expect(JSON.stringify(fixture)).toBe(before);
});
