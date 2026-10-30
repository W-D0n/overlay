// @ts-check
import { describe, test, expect } from 'bun:test';
import {
  defaultBackgroundFile,
  validateBackgroundCurrent,
  validatePresetName,
  validateBackgroundPreset,
  validateBackgroundFile,
  createPresetId,
  migrateBackgroundFile,
  encodePersistedFile,
  upgradePersistedV3,
  decodePersistedFile,
  readBackgroundFile,
  canonicalBackgroundCurrent,
  canonicalBackgroundPreset,
  upsertScene,
  renameScene,
  duplicateScene,
  removeScene,
  emptyLiveScene,
  validateSceneFile,
  readSceneMap,
  readBranding,
  PRESET_NAME_MAX_LENGTH,
} from './background-state-format.js';
import { sceneFromCurrent, sceneFromPreset } from '../scene-doc.js';

/** @type {(over?: object) => { id: string, name: string, component: string, options: Record<string, unknown> }} */
const preset = (over = {}) => ({ id: 'pluie-douce', name: 'pluie douce', component: 'rain', options: { intensity: 0.3 }, ...over });

// ── defaultBackgroundFile ────────────────────────────────────────────────

test('defaultBackgroundFile is valid against validateSceneFile', () => {
  expect(validateSceneFile(defaultBackgroundFile())).toEqual({ ok: true, errors: [] });
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

// ── opérations sur les scènes ────────────────────────────────────────────

const scene = (over = {}) => sceneFromPreset(preset(over));

test('upsertScene appends a scene with a new id', () => {
  const added = scene({ id: 'orage', name: 'orage' });
  expect(upsertScene([scene()], added)).toEqual([scene(), added]);
});

test('upsertScene replaces the scene with the same id in place, including after a rename', () => {
  const replaced = scene({ name: 'pluie fine', options: { intensity: 0.9 } });
  const other = scene({ id: 'orage', name: 'orage' });
  expect(upsertScene([scene(), other], replaced)).toEqual([replaced, other]);
});

test('upsertScene does not mutate the input array and returns a new reference', () => {
  const before = [scene()];
  const result = upsertScene(before, scene({ id: 'orage', name: 'orage' }));
  expect(before).toEqual([scene()]);
  expect(result).not.toBe(before);
});

test('renameScene changes only the display name', () => {
  expect(renameScene([scene()], 'pluie-douce', 'Pluie légère')).toEqual([scene({ name: 'Pluie légère' })]);
});

test('duplicateScene creates a unique id and name and copies every layer, not a reference to them', () => {
  const source = scene();
  const copy = duplicateScene([source], 'pluie-douce');
  expect(copy).toEqual(scene({ id: 'pluie-douce-copie', name: 'pluie douce — copie' }));
  expect(copy?.layers[0]).not.toBe(source.layers[0]);
  expect(copy?.layers[0].options).not.toBe(source.layers[0].options);
});

test('duplicateScene keeps the generated display name within the public name limit', () => {
  const source = scene({ name: 'a'.repeat(PRESET_NAME_MAX_LENGTH) });
  expect(duplicateScene([source], source.id)?.name.length).toBeLessThanOrEqual(PRESET_NAME_MAX_LENGTH);
});

test('duplicateScene answers null for an unknown id', () => {
  expect(duplicateScene([scene()], 'inconnu')).toBeNull();
});

// ── removeScene ──────────────────────────────────────────────────────────

test('removeScene removes the scene by stable id', () => {
  const other = scene({ id: 'orage', name: 'orage' });
  expect(removeScene([scene(), other], 'pluie-douce')).toEqual([other]);
});

test('removeScene is a no-op on an absent id', () => {
  expect(removeScene([scene()], 'inconnu')).toEqual([scene()]);
});

test('removeScene does not mutate the input array and returns a new reference', () => {
  const before = [scene()];
  const result = removeScene(before, 'pluie-douce');
  expect(before).toEqual([scene()]);
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

test('defaultBackgroundFile porte la version courante (4)', () => {
  expect(defaultBackgroundFile().version).toBe(4);
});

test('la migration depuis le format sans version convertit « Oui » / « Non » en booléens dans l’état courant et tous les presets', () => {
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
  expect(file.version).toBe(4);
  expect(file.current.options).toEqual({ audioReactive: true, speed: 1 });
  expect(file.presets.map((entry) => entry.options)).toEqual([
    { audioReactive: false },
    { audioReactive: true, count: 5 },
    { intensity: 0.2 },
  ]);
  expect(validateBackgroundFile(file)).toEqual({ ok: true, errors: [] });
  expect(legacy.current.options.audioReactive).toBe('Oui');
});

test('un fichier en version 2 est migré en version courante sans toucher à son contenu ; le résultat ne migre plus', () => {
  const current = { version: 2, current: { component: 'RainBackground', options: { audioReactive: true } }, presets: [] };
  const first = migrateBackgroundFile(current);
  expect(first).toEqual({ file: { ...current, version: 4 }, migrated: true });
  expect(migrateBackgroundFile(first.file)).toEqual({ file: first.file, migrated: false });
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

// ── version 4 : le modèle est un document de scène par preset ─────────────

const WORKING = () => ({
  version: 4,
  current: sceneFromCurrent({ component: 'rain', options: { audioReactive: true }, transition: { type: 'fade', durationMs: 400 }, showBranding: false }),
  scenes: [
    sceneFromPreset({ id: 'calme', name: 'Calme', component: 'bubble', options: { audioReactive: false }, tags: ['brb'] }),
    sceneFromPreset({ id: 'nuit', name: 'Nuit', component: 'rain', options: {}, transition: { type: 'fade', durationMs: 800 } }),
  ],
  sceneMap: { Jeu: 'calme' },
});
const kindsOf = (scene) => scene.layers.map((layer) => layer.kind);

test('le fichier de travail des tests est valide', () => {
  expect(validateSceneFile(WORKING())).toEqual({ ok: true, errors: [] });
});

test('encodePersistedFile : chaque preset est une scène (son effet puis son branding), current est la scène en antenne', () => {
  const persisted = encodePersistedFile(WORKING());
  expect(persisted.version).toBe(4);
  expect(persisted.presets).toBeUndefined();
  expect(persisted.scenes.map((scene) => scene.id)).toEqual(['calme', 'nuit']);
  expect(kindsOf(persisted.scenes[0])).toEqual(['bubble', 'branding']);
  expect(persisted.scenes[0].layers[0]).toMatchObject({ id: 'main', kind: 'bubble', visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 } });
  expect(persisted.scenes[0].showBranding).toBeUndefined();
  expect(persisted.current.id).toBe('current');
  expect(kindsOf(persisted.current)).toEqual(['rain']);
  expect(persisted.sceneMap).toEqual({ Jeu: 'calme' });
});

test('la scène en antenne sans couche se persiste en null et revient vide ; avec le seul branding, elle reste une scène', () => {
  const hidden = encodePersistedFile({ ...WORKING(), current: emptyLiveScene() });
  expect(hidden.current).toBeNull();
  const decodedHidden = decodePersistedFile(JSON.parse(JSON.stringify(hidden)));
  expect(decodedHidden.ok && decodedHidden.file.current).toEqual(emptyLiveScene());

  const brandingOnly = sceneFromCurrent({ component: null, options: {} });
  const shown = encodePersistedFile({ ...WORKING(), current: brandingOnly });
  expect(kindsOf(shown.current)).toEqual(['branding']);
  const decodedShown = decodePersistedFile(JSON.parse(JSON.stringify(shown)));
  expect(decodedShown.ok && decodedShown.file.current).toEqual(brandingOnly);
});

test('aller-retour : décoder ce qui a été encodé redonne exactement le fichier de travail', () => {
  const file = WORKING();
  const decoded = decodePersistedFile(JSON.parse(JSON.stringify(encodePersistedFile(file))));
  expect(decoded.ok).toBe(true);
  expect(decoded.file).toEqual(file);
});

test('la branding survit à l’aller-retour', () => {
  const file = { ...WORKING(), branding: { text: 'D0n', position: 'top-left' } };
  const decoded = decodePersistedFile(JSON.parse(JSON.stringify(encodePersistedFile(file))));
  expect(decoded.file.branding).toEqual(file.branding);
});

const HISTORY = () => [
  { at: '2026-10-30T11:00:00.000Z', scene: sceneFromCurrent({ component: 'rain', options: {}, transition: { type: 'fade', durationMs: 500 } }) },
  { at: '2026-10-30T10:00:00.000Z', scene: sceneFromCurrent({ component: null, options: {} }) },
  { at: '2026-10-30T09:00:00.000Z', scene: emptyLiveScene() },
];

test('l’historique se persiste en scènes et revient à l’identique, scène vide comprise', () => {
  const file = { ...WORKING(), history: HISTORY() };
  const persisted = JSON.parse(JSON.stringify(encodePersistedFile(file)));
  expect(persisted.history[0].at).toBe('2026-10-30T11:00:00.000Z');
  expect(kindsOf(persisted.history[0].scene)).toEqual(['rain', 'branding']);
  expect(kindsOf(persisted.history[1].scene)).toEqual(['branding']);
  expect(persisted.history[2].scene).toBeNull();
  const decoded = decodePersistedFile(persisted);
  expect(decoded.ok).toBe(true);
  expect(decoded.file).toEqual(file);
});

test('sans historique, le fichier persisté n’en porte pas', () => {
  expect('history' in encodePersistedFile(WORKING())).toBe(false);
});

test('un historique invalide fait refuser le fichier, avec son emplacement', () => {
  const persisted = JSON.parse(JSON.stringify(encodePersistedFile({ ...WORKING(), history: HISTORY() })));
  persisted.history[0].at = 'hier';
  const read = readBackgroundFile(persisted);
  expect(read.ok).toBe(false);
  expect(read.errors.join(' ')).toContain('history[0].at');
});

const DRAFTS = () => ({ calme: { at: '2026-10-30T12:00:00.000Z', scene: sceneFromCurrent({ component: 'rain', options: {}, transition: { type: 'fade', durationMs: 500 }, showBranding: false }) } });

test('les brouillons se persistent en scènes sous l’identifiant du preset et reviennent à l’identique', () => {
  const file = { ...WORKING(), drafts: DRAFTS() };
  const persisted = JSON.parse(JSON.stringify(encodePersistedFile(file)));
  expect(persisted.drafts.calme).toMatchObject({ at: '2026-10-30T12:00:00.000Z', scene: { layers: [{ kind: 'rain' }] } });
  const decoded = decodePersistedFile(persisted);
  expect(decoded.ok).toBe(true);
  expect(decoded.file).toEqual(file);
  expect('drafts' in encodePersistedFile(WORKING())).toBe(false);
});

test('le brouillon d’un preset inconnu fait refuser le fichier, avec son emplacement', () => {
  const persisted = JSON.parse(JSON.stringify(encodePersistedFile({ ...WORKING(), drafts: DRAFTS() })));
  persisted.drafts.fantome = persisted.drafts.calme;
  const read = readBackgroundFile(persisted);
  expect(read.ok).toBe(false);
  expect(read.errors.join(' ')).toContain('drafts[fantome]');
});

test('un brouillon sans effet est refusé ; à plusieurs couches, il est lu', () => {
  const noEffect = JSON.parse(JSON.stringify(encodePersistedFile({ ...WORKING(), drafts: DRAFTS() })));
  noEffect.drafts.calme.scene = sceneFromCurrent({ component: null, options: {} });
  expect(readBackgroundFile(noEffect).errors.join(' ')).toContain('un effet est requis');
  const multi = JSON.parse(JSON.stringify(encodePersistedFile({ ...WORKING(), drafts: DRAFTS() })));
  multi.drafts.calme.scene.layers.push({ ...multi.drafts.calme.scene.layers[0], id: 'second' });
  const read = readBackgroundFile(multi);
  expect(read.ok && read.file.drafts.calme.scene.layers.map((l) => l.id)).toEqual(['main', 'second']);
});

test('une scène à plusieurs couches se lit, à l’antenne, dans l’historique et dans la bibliothèque, et revient à l’identique', () => {
  const stack = (scene) => ({ ...scene, layers: [...scene.layers, { ...scene.layers[0], id: 'second', opacity: 0.5, placement: { x: 0.25, y: 0, width: 0.5, height: 1 } }] });
  const file = WORKING();
  const multi = { ...file, current: stack(file.current), scenes: [stack(file.scenes[0]), file.scenes[1]], history: [{ at: '2026-10-30T11:00:00.000Z', scene: stack(file.current) }] };
  const read = readBackgroundFile(JSON.parse(JSON.stringify(encodePersistedFile(multi))));
  expect(read.ok).toBe(true);
  expect(read.file).toEqual(multi);
});

test('une scène à plusieurs couches dont une couche est invalide est refusée avec son emplacement', () => {
  const persisted = JSON.parse(JSON.stringify(encodePersistedFile(WORKING())));
  persisted.scenes[1].layers.push({ ...persisted.scenes[1].layers[0], id: 'second', opacity: 'opaque' });
  const decoded = decodePersistedFile(persisted);
  expect(decoded.ok).toBe(false);
  expect(decoded.errors.join(' ')).toContain('scenes[1]');
  expect(decoded.errors.join(' ')).toContain('layers[second].opacity');
});

test('une scène invalide est refusée avec son emplacement', () => {
  const persisted = JSON.parse(JSON.stringify(encodePersistedFile(WORKING())));
  persisted.scenes[0].layers[0].kind = 'inconnu';
  const decoded = decodePersistedFile(persisted);
  expect(decoded.ok).toBe(false);
  expect(decoded.errors.join(' ')).toContain('scenes[0]');
});

test('readBackgroundFile : version 4 lue sans migration', () => {
  const read = readBackgroundFile(JSON.parse(JSON.stringify(encodePersistedFile(WORKING()))));
  expect(read.ok && read.migratedFrom).toBeNull();
  expect(read.ok && read.file).toEqual(WORKING());
});

// ── version 3 → 4 : showBranding devient une couche ───────────────────────

const layerOf = (id, kind) => ({ id, kind, visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: {} });
const sceneV3 = (id, extra = {}) => ({ version: 1, id, name: id, layers: [layerOf('main', 'rain')], ...extra });
const FILE_V3 = () => ({
  version: 3,
  current: sceneV3('current', { showBranding: false }),
  scenes: [sceneV3('affiche'), sceneV3('explicite', { showBranding: true }), sceneV3('masque', { showBranding: false })],
  history: [{ at: '2026-10-30T10:00:00.000Z', scene: null }, { at: '2026-10-30T09:00:00.000Z', scene: sceneV3('current', { showBranding: false }) }],
  drafts: { affiche: { at: '2026-10-30T11:00:00.000Z', scene: sceneV3('current') } },
  sceneMap: { Jeu: 'affiche' },
});
describe('mise à niveau d’un fichier version 3', () => {
  test('une scène qui affichait le branding (absent ou vrai) reçoit une couche branding en tête ; masqué, rien', () => {
    const up = upgradePersistedV3(FILE_V3());
    expect(up.version).toBe(4);
    expect(up.scenes.map(kindsOf)).toEqual([['rain', 'branding'], ['rain', 'branding'], ['rain']]);
    expect(up.scenes.every((scene) => !('showBranding' in scene))).toBe(true);
    expect(kindsOf(up.current)).toEqual(['rain']);
    expect(kindsOf(up.drafts.affiche.scene)).toEqual(['rain', 'branding']);
  });

  test('« aucun fond » (null) affichait le branding : il devient une scène du seul branding, pour ne pas le perdre', () => {
    const up = upgradePersistedV3({ ...FILE_V3(), current: null });
    expect(kindsOf(up.current)).toEqual(['branding']);
    expect(kindsOf(up.history[0].scene)).toEqual(['branding']);
    expect(up.history[1].scene.layers.map((layer) => layer.kind)).toEqual(['rain']);
  });

  test('ne touche ni au contenu des scènes, ni à la table des scènes OBS, ni à ce qu’il ne connaît pas', () => {
    const raw = { ...FILE_V3(), extra: { garde: true } };
    const up = upgradePersistedV3(raw);
    expect(up.sceneMap).toEqual({ Jeu: 'affiche' });
    expect(up.extra).toEqual({ garde: true });
    expect(up.scenes[0].layers[0]).toEqual(raw.scenes[0].layers[0]);
  });

  test('le fichier d’origine n’est pas modifié, et une scène qui a déjà son branding n’en gagne pas un second', () => {
    const raw = FILE_V3();
    const before = JSON.stringify(raw);
    upgradePersistedV3(raw);
    expect(JSON.stringify(raw)).toBe(before);
    const twice = upgradePersistedV3({ ...raw, scenes: [{ ...sceneV3('a'), layers: [layerOf('main', 'rain'), layerOf('branding', 'branding')] }] });
    expect(kindsOf(twice.scenes[0])).toEqual(['rain', 'branding']);
  });

  test('readBackgroundFile lit un fichier version 3 et dit qu’il vient de 3 ; chaque scène a sa couche de branding ou non', () => {
    const read = readBackgroundFile(FILE_V3());
    expect(read.ok).toBe(true);
    expect(read.migratedFrom).toBe(3);
    expect(read.file.version).toBe(4);
    expect(read.file.scenes.map(kindsOf)).toEqual([['rain', 'branding'], ['rain', 'branding'], ['rain']]);
    expect(kindsOf(read.file.current)).toEqual(['rain']);
    expect(kindsOf(read.file.history[0].scene)).toEqual(['branding']);
  });

  test('les fichiers mis à niveau puis relus ne migrent plus', () => {
    const read = readBackgroundFile(FILE_V3());
    const again = readBackgroundFile(JSON.parse(JSON.stringify(encodePersistedFile(read.file))));
    expect(again.migratedFrom).toBeNull();
    expect(again.file).toEqual(read.file);
  });
});

test('readBackgroundFile : version 2 et format sans version sont migrés et disent d’où ils viennent', () => {
  const v2 = { version: 2, current: { component: 'rain', options: {} }, presets: [{ id: 'a', name: 'A', component: 'bubble', options: {} }] };
  const read2 = readBackgroundFile(v2);
  expect(read2.ok && read2.migratedFrom).toBe(2);
  expect(read2.ok && read2.file.scenes.map((scene) => scene.id)).toEqual(['a']);
  const v1 = { current: { component: 'RainBackground', options: { audioReactive: 'Oui' } }, presets: [] };
  const read1 = readBackgroundFile(v1);
  expect(read1.ok && read1.migratedFrom).toBe(1);
  expect(read1.ok && read1.file.current.layers[0].options.audioReactive).toBe(true);
  expect(read1.ok && kindsOf(read1.file.current)).toEqual(['rain', 'branding']);
});

test('readBackgroundFile : un fichier invalide est refusé, jamais réparé', () => {
  expect(readBackgroundFile({ version: 2, current: { component: 'inconnu', options: {} }, presets: [] }).ok).toBe(false);
  expect(readBackgroundFile('pas un objet').ok).toBe(false);
});

test('canonicalBackgroundCurrent : « branding affiché » est l’état par défaut, seul « masqué » s’écrit ; une valeur invalide reste pour que la validation la refuse', () => {
  expect(canonicalBackgroundCurrent({ component: 'rain', options: {}, showBranding: true })).toEqual({ component: 'rain', options: {} });
  expect(canonicalBackgroundCurrent({ component: 'rain', options: {}, showBranding: false })).toEqual({ component: 'rain', options: {}, showBranding: false });
  const invalid = canonicalBackgroundCurrent({ component: 'rain', options: {}, showBranding: 'non' });
  expect(invalid.showBranding).toBe('non');
  expect(validateBackgroundCurrent(invalid).ok).toBe(false);
  expect(canonicalBackgroundPreset({ id: 'a', name: 'A', component: 'rain', options: {}, showBranding: true })).toEqual({ id: 'a', name: 'A', component: 'rain', options: {} });
});

describe('validateSceneFile', () => {
  const errorsOf = (file) => validateSceneFile(file).errors.join(' | ');

  test('une scène nommée sans couche d’effet est refusée : le branding seul n’est pas un fond à rappeler', () => {
    const brandingOnly = { ...sceneFromCurrent({ component: null, options: {} }), id: 'seul', name: 'Seul' };
    expect(errorsOf({ ...WORKING(), scenes: [brandingOnly] })).toContain('scenes[0] : un effet est requis');
  });

  test('nom, identifiant d’URL, étiquettes, doublons : refusés avec leur emplacement', () => {
    const [calme] = WORKING().scenes;
    expect(errorsOf({ ...WORKING(), scenes: [{ ...calme, name: ' Calme' }] })).toContain('scenes[0] : nom de preset');
    expect(errorsOf({ ...WORKING(), scenes: [{ ...calme, id: 'Calme_1' }] })).toContain('scenes[0] : id de preset');
    expect(errorsOf({ ...WORKING(), scenes: [{ ...calme, tags: [''] }] })).toContain('scenes[0] : tags');
    expect(errorsOf({ ...WORKING(), scenes: [calme, { ...calme, id: 'autre' }] })).toContain('preset en double : Calme');
    expect(errorsOf({ ...WORKING(), scenes: [calme, { ...calme, name: 'Autre' }] })).toContain('id de preset en double : calme');
  });

  test('une transition invalide sur la scène en antenne ou sur un preset est refusée', () => {
    const [calme] = WORKING().scenes;
    expect(errorsOf({ ...WORKING(), current: { ...WORKING().current, transition: { type: 'morph' } } })).toContain('current : transition.type');
    expect(errorsOf({ ...WORKING(), scenes: [{ ...calme, transition: { type: 'morph' } }] })).toContain('scenes[0] : transition.type');
  });

  test('la scène en antenne peut être vide ; un preset ne peut pas', () => {
    expect(validateSceneFile({ ...WORKING(), current: emptyLiveScene() }).ok).toBe(true);
    expect(errorsOf({ ...WORKING(), scenes: [{ ...WORKING().scenes[0], layers: [] }] })).toContain('au moins une couche');
  });
});
