import { expect, test } from 'bun:test';
import { BUILTIN_BACKGROUND_PRESETS } from './builtin-background-presets.js';
import { validateBackgroundPreset } from './background-state-format.js';

test('les cinq points de départ sont valides et ont des identifiants uniques', () => {
  expect(BUILTIN_BACKGROUND_PRESETS).toHaveLength(5);
  expect(new Set(BUILTIN_BACKGROUND_PRESETS.map(({ id }) => id)).size).toBe(BUILTIN_BACKGROUND_PRESETS.length);
  for (const preset of BUILTIN_BACKGROUND_PRESETS) {
    expect(validateBackgroundPreset(preset), preset.id).toEqual({ ok: true, errors: [] });
    expect(preset.tags?.length, `${preset.id} tags`).toBeGreaterThan(0);
  }
});

test('les points de départ à plusieurs couches sont des scènes valides, uniques, à plusieurs effets, sans collision avec les autres', async () => {
  const { BUILTIN_BACKGROUND_SCENES } = await import('./builtin-background-presets.js');
  const { validateSceneDoc } = await import('../scene-doc.js');
  expect(BUILTIN_BACKGROUND_SCENES.length).toBeGreaterThanOrEqual(3);
  const ids = [...BUILTIN_BACKGROUND_PRESETS, ...BUILTIN_BACKGROUND_SCENES].map(({ id }) => id);
  expect(new Set(ids).size).toBe(ids.length);
  const names = [...BUILTIN_BACKGROUND_PRESETS, ...BUILTIN_BACKGROUND_SCENES].map(({ name }) => name);
  expect(new Set(names).size).toBe(names.length);
  for (const scene of BUILTIN_BACKGROUND_SCENES) {
    expect(validateSceneDoc(scene).ok, scene.id).toBe(true);
    expect(scene.layers.length, `${scene.id} couches`).toBeGreaterThanOrEqual(2);
    expect(scene.tags?.length, `${scene.id} tags`).toBeGreaterThan(0);
  }
});
