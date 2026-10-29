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
  canonicalBackgroundCurrent,
  canonicalBackgroundPreset,
  upsertPreset,
  renamePreset,
  duplicatePreset,
  removePreset,
  readSceneMap,
  readBranding,
  PRESET_NAME_MAX_LENGTH,
} from './background-state-format.js';

/** @type {(over?: object) => { id: string, name: string, component: string, options: Record<string, unknown> }} */
const preset = (over = {}) => ({ id: 'pluie-douce', name: 'pluie douce', component: 'rain', options: { intensity: 0.3 }, ...over });

// ── defaultBackgroundFile ────────────────────────────────────────────────

test('defaultBackgroundFile is valid against validateBackgroundFile', () => {
  expect(validateBackgroundFile(defaultBackgroundFile())).toEqual({ ok: true, errors: [] });
});

test('defaultBackgroundFile returns a new object on each call', () => {
  expect(defaultBackgroundFile()).not.toBe(defaultBackgroundFile());
});

// ── validateBackgroundCurrent ────────────────────────────────────────────

test('validateBackgroundCurrent accepts a known effect with options', () => {
  expect(validateBackgroundCurrent({ component: 'rain', options: { intensity: 0.6 } }).ok).toBe(true);
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
  expect(validateBackgroundPreset({ name: 'pluie douce', component: 'rain', options: {} }).ok).toBe(false);
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
  const file = { current: { component: 'rain', options: {} }, presets: [preset()] };
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
    current: { component: 'rain', options: { speed: 2 } },
    presets: [
      { name: 'Pluie douce', component: 'rain', options: { intensity: 0.3 } },
      { name: 'Pluie douce !', component: 'rain', options: { intensity: 0.8 } },
    ],
  };
  const result = migrateBackgroundFile(legacy);
  expect(result.migrated).toBe(true);
  expect(result.file.presets.map(({ id }) => id)).toEqual(['pluie-douce', 'pluie-douce-2']);
  expect(result.file.current).toEqual(legacy.current);
  expect(result.file.presets[0].options).toEqual({ intensity: 0.3 });
});

test('migrateBackgroundFile retires MatrixGrid safely without mutating persisted input', () => {
  const persisted = {
    current: { component: 'MatrixGridBackground', options: { speed: 0.7 } },
    presets: [
      { id: 'horizon-neon', name: 'Horizon néon', component: 'MatrixGridBackground', options: { density: 18 } },
      { name: 'Pluie douce', component: 'rain', options: { intensity: 0.3 } },
    ],
  };
  const before = structuredClone(persisted);

  const result = migrateBackgroundFile(persisted);

  expect(result.migrated).toBe(true);
  expect(result.file.current).toEqual({ component: null, options: {} });
  expect(result.file.presets).toEqual([
    { id: 'pluie-douce', name: 'Pluie douce', component: 'rain', options: { intensity: 0.3 } },
  ]);
  expect(persisted).toEqual(before);
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

test('un fichier écrit avant le mapping OBS reste valide et lit une table vide', () => {
  const legacy = { current: { component: 'dotgrid', options: {} }, presets: [] };
  expect(validateBackgroundFile(legacy).ok).toBe(true);
  expect(readSceneMap(legacy)).toEqual({});
});

test('une table d’association valide est relue telle quelle', () => {
  const file = {
    current: { component: 'dotgrid', options: {} },
    presets: [],
    sceneMap: { Discussion: 'discussion-calme' },
  };
  expect(validateBackgroundFile(file).ok).toBe(true);
  expect(readSceneMap(file)).toEqual({ Discussion: 'discussion-calme' });
});

test('une table d’association invalide rend le fichier invalide', () => {
  const file = {
    current: { component: 'dotgrid', options: {} },
    presets: [],
    sceneMap: { Discussion: 42 },
  };
  const result = validateBackgroundFile(file);
  expect(result.ok).toBe(false);
  expect(result.errors.join(' ')).toContain('sceneMap');
});

test('un fichier neuf part avec une table d’association vide', () => {
  expect(defaultBackgroundFile().sceneMap).toEqual({});
});

test('un preset sans transition reste valide', () => {
  expect(validateBackgroundPreset({
    id: 'alpha', name: 'Alpha', component: 'rain', options: {},
  }).ok).toBe(true);
});

test('une transition valide est acceptée sur un preset comme sur l’état courant', () => {
  const transition = { type: 'wipe', durationMs: 400, direction: 'up' };
  expect(validateBackgroundPreset({
    id: 'alpha', name: 'Alpha', component: 'rain', options: {}, transition,
  }).ok).toBe(true);
  expect(validateBackgroundCurrent({
    component: 'rain', options: {}, transition,
  }).ok).toBe(true);
});

test('une transition fautive rend le preset invalide et nomme le champ', () => {
  const result = validateBackgroundPreset({
    id: 'alpha', name: 'Alpha', component: 'rain', options: {},
    transition: { type: 'morph' },
  });
  expect(result.ok).toBe(false);
  expect(result.errors.join(' ')).toContain('transition.type');
});

test('une transition fautive rend l’état courant invalide', () => {
  const result = validateBackgroundCurrent({
    component: 'rain', options: {}, transition: { durationMs: 9000 },
  });
  expect(result.ok).toBe(false);
  expect(result.errors.join(' ')).toContain('transition.durationMs');
});

test('un fichier sans branding reste valide et n’affiche rien', () => {
  const legacy = { current: { component: 'dotgrid', options: {} }, presets: [] };
  expect(validateBackgroundFile(legacy).ok).toBe(true);
  expect(readBranding(legacy).name).toBe('');
  expect(readBranding(legacy).lines).toEqual([]);
});

test('un branding enregistré est relu normalisé', () => {
  const file = {
    current: { component: 'dotgrid', options: {} },
    presets: [],
    branding: { name: 'D0n', lines: ['twitch.tv/d0n'], x: 12, y: 88 },
  };
  expect(validateBackgroundFile(file).ok).toBe(true);
  expect(readBranding(file)).toMatchObject({ name: 'D0n', x: 12, y: 88 });
});

test('un branding fautif rend le fichier invalide', () => {
  const file = {
    current: { component: 'dotgrid', options: {} },
    presets: [],
    branding: { x: 400 },
  };
  const result = validateBackgroundFile(file);
  expect(result.ok).toBe(false);
  expect(result.errors.join(' ')).toContain('branding.x');
});

test('showBranding n’accepte qu’un booléen, sur le preset comme sur l’état courant', () => {
  expect(validateBackgroundCurrent({
    component: 'rain', options: {}, showBranding: false,
  }).ok).toBe(true);
  expect(validateBackgroundCurrent({
    component: 'rain', options: {}, showBranding: 'non',
  }).ok).toBe(false);
  expect(validateBackgroundPreset({
    id: 'alpha', name: 'Alpha', component: 'rain', options: {}, showBranding: true,
  }).ok).toBe(true);
  expect(validateBackgroundPreset({
    id: 'alpha', name: 'Alpha', component: 'rain', options: {}, showBranding: 1,
  }).ok).toBe(false);
});

// ── version 2 : valeurs persistées neutres ───────────────────────────────

test('defaultBackgroundFile porte la version 2', () => {
  expect(defaultBackgroundFile().version).toBe(2);
});

test('la migration 1 → 2 convertit « Oui » / « Non » en booléens dans l’état courant et tous les presets', () => {
  const legacy = {
    current: { component: 'RainBackground', options: { audioReactive: 'Oui', speed: 1 } },
    presets: [
      preset({ id: 'a', name: 'a', options: { audioReactive: 'Non' } }),
      preset({ id: 'b', name: 'b', component: 'BubbleBackground', options: { audioReactive: 'Oui', count: 5 } }),
      preset({ id: 'c', name: 'c', options: { intensity: 0.2 } }),
    ],
  };
  const { file, migrated } = migrateBackgroundFile(legacy);
  expect(migrated).toBe(true);
  expect(file.version).toBe(2);
  expect(file.current.options).toEqual({ audioReactive: true, speed: 1 });
  expect(file.presets.map((entry) => entry.options)).toEqual([
    { audioReactive: false },
    { audioReactive: true, count: 5 },
    { intensity: 0.2 },
  ]);
  expect(validateBackgroundFile(file)).toEqual({ ok: true, errors: [] });
  expect(legacy.current.options.audioReactive).toBe('Oui');
});

test('un fichier déjà en version 2 n’est pas modifié, et la migration est idempotente', () => {
  const current = { version: 2, current: { component: 'RainBackground', options: { audioReactive: true } }, presets: [] };
  expect(migrateBackgroundFile(current)).toEqual({ file: current, migrated: false });
  const once = migrateBackgroundFile({ current: { component: null, options: {} }, presets: [] });
  expect(migrateBackgroundFile(once.file).migrated).toBe(false);
});

test('la migration renomme les effets vers leurs identifiants neutres dans l’état courant et les presets', () => {
  const { file } = migrateBackgroundFile({
    current: { component: 'ShapeMorphBackground', options: {} },
    presets: [preset({ id: 'a', name: 'a', component: 'FloatingSymbolsBackground' }), preset({ id: 'b', name: 'b', component: 'rain' })],
  });
  expect(file.current.component).toBe('shape-morph');
  expect(file.presets.map((entry) => entry.component)).toEqual(['floating-symbols', 'rain']);
  expect(validateBackgroundFile(file)).toEqual({ ok: true, errors: [] });
});

test('un ancien nom d’effet reste valide à la lecture ; un nom inconnu est toujours refusé', () => {
  expect(validateBackgroundCurrent({ component: 'RainBackground', options: {} }).ok).toBe(true);
  expect(validateBackgroundCurrent({ component: 'rain', options: {} }).ok).toBe(true);
  expect(validateBackgroundCurrent({ component: 'FantomeBackground', options: {} }).ok).toBe(false);
});

test('canonicalBackgroundCurrent et canonicalBackgroundPreset ramènent nom et valeurs à la forme persistée', () => {
  expect(canonicalBackgroundCurrent({ component: 'RainBackground', options: { audioReactive: 'Oui' } }))
    .toEqual({ component: 'rain', options: { audioReactive: true } });
  expect(canonicalBackgroundCurrent({ component: null, options: {} })).toEqual({ component: null, options: {} });
  expect(canonicalBackgroundPreset(preset({ component: 'WaterRippleBackground' })).component).toBe('water-ripple');
});

test('validateBackgroundCurrent et validateBackgroundPreset rejettent les types invalides d’options', () => {
  const invalid = validateBackgroundCurrent({ component: 'rain', options: { speed: 'abc' } });
  expect(invalid.ok).toBe(false);
  expect(invalid.errors.join(' ')).toContain('speed : nombre attendu');
  expect(validateBackgroundPreset(preset({ options: { speed: 'abc' } })).ok).toBe(false);
  expect(validateBackgroundCurrent({ component: 'rain', options: { speed: 2 } }).ok).toBe(true);
});

test('la forme persistée ramène aussi les nombres dans leurs bornes', () => {
  expect(canonicalBackgroundCurrent({ component: 'bubble', options: { count: 9999 } }).options).toEqual({ count: 200 });
  expect(canonicalBackgroundPreset(preset({ component: 'bubble', options: { count: 9999 } })).options).toEqual({ count: 200 });
});
