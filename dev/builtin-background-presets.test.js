import { expect, test } from 'bun:test';
import { BUILTIN_BACKGROUND_PRESETS } from './builtin-background-presets.js';
import { validateBackgroundPreset } from './background-state-format.js';

test('la bibliothèque Atelier contient des presets valides aux identifiants uniques', () => {
  expect(BUILTIN_BACKGROUND_PRESETS.length).toBeGreaterThanOrEqual(6);
  expect(new Set(BUILTIN_BACKGROUND_PRESETS.map(({ id }) => id)).size).toBe(BUILTIN_BACKGROUND_PRESETS.length);
  for (const preset of BUILTIN_BACKGROUND_PRESETS) {
    expect(validateBackgroundPreset(preset), preset.id).toEqual({ ok: true, errors: [] });
    expect(preset.tags?.length, `${preset.id} tags`).toBeGreaterThan(0);
  }
});
