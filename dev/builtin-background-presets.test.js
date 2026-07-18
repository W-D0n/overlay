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
