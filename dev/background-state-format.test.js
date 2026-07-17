// @ts-check
import { test, expect } from 'bun:test';
import {
  defaultBackgroundFile,
  validateBackgroundCurrent,
  validatePresetName,
  validateBackgroundPreset,
  validateBackgroundFile,
  createPresetId,
  migrateBackgroundFile,
  upsertPreset,
  renamePreset,
  duplicatePreset,
  removePreset,
  PRESET_NAME_MAX_LENGTH,
} from './background-state-format.js';

/** @type {(over?: object) => { id: string, name: string, component: string, options: Record<string, unknown> }} */
const preset = (over = {}) => ({ id: 'pluie-douce', name: 'pluie douce', component: 'RainBackground', options: { intensity: 0.3 }, ...over });

// ── defaultBackgroundFile ────────────────────────────────────────────────

test('defaultBackgroundFile is valid against validateBackgroundFile', () => {
  expect(validateBackgroundFile(defaultBackgroundFile())).toEqual({ ok: true, errors: [] });
});

test('defaultBackgroundFile returns a new object on each call', () => {
  expect(defaultBackgroundFile()).not.toBe(defaultBackgroundFile());
});

// ── validateBackgroundCurrent ────────────────────────────────────────────

test('validateBackgroundCurrent accepts a known effect with options', () => {
  expect(validateBackgroundCurrent({ component: 'RainBackground', options: { intensity: 0.6 } }).ok).toBe(true);
});

test('validateBackgroundCurrent accepts component null (no background)', () => {
  expect(validateBackgroundCurrent({ component: null, options: {} }).ok).toBe(true);
});

test('validateBackgroundCurrent rejects an unknown component', () => {
  const result = validateBackgroundCurrent({ component: 'NopeBackground', options: {} });
  expect(result.ok).toBe(false);
  expect(result.errors).toEqual(['effet de fond inconnu : NopeBackground']);
});

test('validateBackgroundCurrent rejects a non-object', () => {
  expect(validateBackgroundCurrent(null).ok).toBe(false);
  expect(validateBackgroundCurrent('rain').ok).toBe(false);
  expect(validateBackgroundCurrent([]).ok).toBe(false);
});

test('validateBackgroundCurrent rejects non-object options and lists all errors at once', () => {
  const result = validateBackgroundCurrent({ component: 'NopeBackground', options: 'x' });
  expect(result.ok).toBe(false);
  expect(result.errors).toHaveLength(2);
});

// ── validatePresetName ───────────────────────────────────────────────────

test('validatePresetName accepts a plain name', () => {
  expect(validatePresetName('pluie douce').ok).toBe(true);
});

test('validatePresetName rejects empty string and non-strings', () => {
  expect(validatePresetName('').ok).toBe(false);
  expect(validatePresetName(42).ok).toBe(false);
  expect(validatePresetName(undefined).ok).toBe(false);
});

test('validatePresetName rejects leading/trailing spaces instead of trimming', () => {
  expect(validatePresetName(' pluie').ok).toBe(false);
  expect(validatePresetName('pluie ').ok).toBe(false);
});

test('validatePresetName accepts exactly the max length and rejects max+1', () => {
  expect(validatePresetName('a'.repeat(PRESET_NAME_MAX_LENGTH)).ok).toBe(true);
  expect(validatePresetName('a'.repeat(PRESET_NAME_MAX_LENGTH + 1)).ok).toBe(false);
});

// ── validateBackgroundPreset ─────────────────────────────────────────────

test('validateBackgroundPreset accepts a nominal preset', () => {
  expect(validateBackgroundPreset(preset())).toEqual({ ok: true, errors: [] });
});

test('validateBackgroundPreset requires a stable URL-safe id', () => {
  expect(validateBackgroundPreset({ name: 'pluie douce', component: 'RainBackground', options: {} }).ok).toBe(false);
  expect(validateBackgroundPreset(preset({ id: 'Pluie douce' })).ok).toBe(false);
});

test('validateBackgroundPreset accepts optional tags', () => {
  expect(validateBackgroundPreset(preset({ tags: ['calme', 'discussion'] })).ok).toBe(true);
  expect(validateBackgroundPreset(preset({ tags: [''] })).ok).toBe(false);
});

test('validateBackgroundPreset rejects component null (nothing to recall)', () => {
  expect(validateBackgroundPreset(preset({ component: null })).ok).toBe(false);
});

test('validateBackgroundPreset lists all invalid fields simultaneously', () => {
  const result = validateBackgroundPreset({ name: '', component: 'Nope', options: 3 });
  expect(result.ok).toBe(false);
  expect(result.errors).toHaveLength(4);
});

// ── validateBackgroundFile ───────────────────────────────────────────────

test('validateBackgroundFile accepts a nominal file with presets', () => {
  const file = { current: { component: 'RainBackground', options: {} }, presets: [preset()] };
  expect(validateBackgroundFile(file)).toEqual({ ok: true, errors: [] });
});

test('validateBackgroundFile rejects a non-object root', () => {
  expect(validateBackgroundFile(null).ok).toBe(false);
  expect(validateBackgroundFile([]).ok).toBe(false);
});

test('validateBackgroundFile rejects non-array presets', () => {
  const result = validateBackgroundFile({ current: { component: null, options: {} }, presets: {} });
  expect(result.ok).toBe(false);
  expect(result.errors).toEqual(['presets : tableau attendu']);
});

test('validateBackgroundFile prefixes preset errors with their index', () => {
  const file = { current: { component: null, options: {} }, presets: [preset(), preset({ id: 'orage', name: 'orage', component: 'Nope' })] };
  const result = validateBackgroundFile(file);
  expect(result.ok).toBe(false);
  expect(result.errors).toEqual(['presets[1] : effet de fond inconnu : Nope']);
});

test('validateBackgroundFile rejects duplicate preset names', () => {
  const file = { current: { component: null, options: {} }, presets: [preset(), preset({ id: 'autre-id', options: {} })] };
  const result = validateBackgroundFile(file);
  expect(result.ok).toBe(false);
  expect(result.errors).toEqual(['preset en double : pluie douce']);
});

test('validateBackgroundFile rejects duplicate preset ids', () => {
  const file = { current: { component: null, options: {} }, presets: [preset(), preset({ name: 'orage' })] };
  expect(validateBackgroundFile(file).errors).toContain('id de preset en double : pluie-douce');
});

test('migrateBackgroundFile adds deterministic ids to legacy presets without altering their visuals', () => {
  const legacy = {
    current: { component: 'RainBackground', options: { speed: 2 } },
    presets: [
      { name: 'Pluie douce', component: 'RainBackground', options: { intensity: 0.3 } },
      { name: 'Pluie douce !', component: 'RainBackground', options: { intensity: 0.8 } },
    ],
  };
  const result = migrateBackgroundFile(legacy);
  expect(result.migrated).toBe(true);
  expect(result.file.presets.map(({ id }) => id)).toEqual(['pluie-douce', 'pluie-douce-2']);
  expect(result.file.current).toEqual(legacy.current);
  expect(result.file.presets[0].options).toEqual({ intensity: 0.3 });
});

test('createPresetId generates a unique slug while preserving existing stable ids', () => {
  expect(createPresetId('Émission spéciale', [preset({ id: 'emission-speciale' })])).toBe('emission-speciale-2');
});

// ── upsertPreset ─────────────────────────────────────────────────────────

test('upsertPreset appends a preset with a new id', () => {
  const added = preset({ id: 'orage', name: 'orage' });
  expect(upsertPreset([preset()], added)).toEqual([preset(), added]);
});

test('upsertPreset replaces the preset with the same id in place, including after a rename', () => {
  const replaced = preset({ name: 'pluie fine', options: { intensity: 0.9 } });
  const other = preset({ id: 'orage', name: 'orage' });
  expect(upsertPreset([preset(), other], replaced)).toEqual([replaced, other]);
});

test('upsertPreset does not mutate the input array and returns a new reference', () => {
  const before = [preset()];
  const result = upsertPreset(before, preset({ id: 'orage', name: 'orage' }));
  expect(before).toEqual([preset()]);
  expect(result).not.toBe(before);
});

test('renamePreset changes only the display name', () => {
  expect(renamePreset([preset()], 'pluie-douce', 'Pluie légère')).toEqual([preset({ name: 'Pluie légère' })]);
});

test('duplicatePreset creates a unique id and name while preserving the visual options', () => {
  const copy = duplicatePreset([preset()], 'pluie-douce');
  expect(copy).toEqual(preset({ id: 'pluie-douce-copie', name: 'pluie douce — copie' }));
  expect(copy?.options).not.toBe(preset().options);
});

test('duplicatePreset keeps the generated display name within the public name limit', () => {
  const source = preset({ name: 'a'.repeat(PRESET_NAME_MAX_LENGTH) });
  expect(duplicatePreset([source], source.id)?.name.length).toBeLessThanOrEqual(PRESET_NAME_MAX_LENGTH);
});

// ── removePreset ─────────────────────────────────────────────────────────

test('removePreset removes the preset by stable id', () => {
  const other = preset({ id: 'orage', name: 'orage' });
  expect(removePreset([preset(), other], 'pluie-douce')).toEqual([other]);
});

test('removePreset is a no-op on an absent name', () => {
  expect(removePreset([preset()], 'inconnu')).toEqual([preset()]);
});

test('removePreset does not mutate the input array and returns a new reference', () => {
  const before = [preset()];
  const result = removePreset(before, 'pluie-douce');
  expect(before).toEqual([preset()]);
  expect(result).not.toBe(before);
});
