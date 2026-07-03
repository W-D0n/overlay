// @ts-check
import { test, expect } from 'bun:test';
import { formatPlacementLiteral, applyPlacementToLayerSource } from './scene-placement-format.js';

const FIXTURE_SOURCE = `export const sceneConfig = {
  id: 'discussion',
  layers: [
    {
      name: 'goldbar',
      components: [{ component: 'GoldBar', options: {} }],
      visibility: { full: true, minimal: true, hidden: false },
    },
    {
      name: 'cam',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
      placement: { x: 40, y: 40, width: 1080, height: 960 },
    },
    {
      name: 'subject',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
  ],
};
`;

test('formatPlacementLiteral formats x/y only', () => {
  expect(formatPlacementLiteral({ x: 10, y: 20 })).toBe('{ x: 10, y: 20 }');
});

test('formatPlacementLiteral formats x/y/width/height', () => {
  expect(formatPlacementLiteral({ x: 10, y: 20, width: 300, height: 400 })).toBe('{ x: 10, y: 20, width: 300, height: 400 }');
});

test('applyPlacementToLayerSource replaces only the targeted layer placement, preserves the rest', () => {
  const updated = applyPlacementToLayerSource(FIXTURE_SOURCE, 'cam', { x: 100, y: 200, width: 500, height: 600 });
  expect(updated).toContain("name: 'cam',\n      components: [],\n      visibility: { full: true, minimal: false, hidden: false },\n      placement: { x: 100, y: 200, width: 500, height: 600 },");
  expect(updated).toContain("name: 'goldbar'"); // reste inchangé
  expect(updated).toContain("name: 'subject'"); // reste inchangé (pas de placement, non touché)
});

test('applyPlacementToLayerSource throws if the layer has no existing placement', () => {
  expect(() => applyPlacementToLayerSource(FIXTURE_SOURCE, 'subject', { x: 0, y: 0 })).toThrow();
});

test('applyPlacementToLayerSource throws if the layer name does not exist', () => {
  expect(() => applyPlacementToLayerSource(FIXTURE_SOURCE, 'nope', { x: 0, y: 0 })).toThrow();
});

test('applyPlacementToLayerSource does not mutate the input string', () => {
  const before = FIXTURE_SOURCE;
  applyPlacementToLayerSource(FIXTURE_SOURCE, 'cam', { x: 1, y: 1 });
  expect(FIXTURE_SOURCE).toBe(before);
});
