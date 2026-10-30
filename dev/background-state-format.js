// @ts-check
import { clampOptions, isIdentityKind, isKnownKindId, neutralizeOptions, resolveKindId, validateOptions } from '../layer-kinds.js';
import { validateSceneMap } from '../obs-scene-mapping.js';
import { validateTransition } from '../background-transition.js';
import { normalizeBranding, validateBranding } from '../branding-format.js';
import { BRANDING_LAYER_ID, CURRENT_SCENE, SCENE_DOC_VERSION, sceneFromCurrent, sceneFromPreset, validateSceneDoc } from '../scene-doc.js';
import { validateHistory } from './background-history.js';
import { validateDrafts } from './preset-drafts.js';
import { validateStudioSettings } from './studio-settings.js';

/**
 * dev/background-state-format.js — Logique pure de l'état background standalone (2026-07-14).
 *
 * Validation et transformations du fichier `dev/data/background-state.json`, consommé par
 * `background-state-server.js` (voir docs/specs/background-standalone.md). Aucune I/O ici —
 * testable sans serveur (même découpage AD-1 que `scene-data-format.js`).
 *
 * Le modèle du serveur est un document de scène par preset et pour l'antenne (`BackgroundFile`). La forme plate
 * `{ component, options, … }` (`BackgroundCurrent`, `BackgroundPreset`) reste celle des fichiers antérieurs à la
 * version 3 et des lots d'import ; la frontière HTTP (`dev/state-wire.js`) la convertit.
 *
 * @typedef {import('../background-transition.js').BackgroundTransition} BackgroundTransition
 * @typedef {import('../scene-doc.js').SceneDoc} SceneDoc
 * @typedef {{ component: string | null, options: Record<string, unknown>, transition?: BackgroundTransition, showBranding?: boolean }} BackgroundCurrent
 * @typedef {{ id: string, name: string, component: string, options: Record<string, unknown>, tags?: string[], transition?: BackgroundTransition, showBranding?: boolean }} BackgroundPreset
 * @typedef {import('../branding-format.js').Branding} Branding
 * @typedef {import('./background-history.js').HistoryEntry} HistoryEntry
 * @typedef {import('./preset-drafts.js').Drafts} Drafts
 * @typedef {import('./studio-settings.js').StudioSettings} StudioSettings
 * @typedef {{ version?: number, current: SceneDoc, scenes: SceneDoc[], sceneMap?: Record<string, string>, branding?: Branding, history?: HistoryEntry[], drafts?: Drafts, studio?: Partial<StudioSettings> }} BackgroundFile
 * @typedef {{ version?: number, current: BackgroundCurrent, presets: BackgroundPreset[], sceneMap?: Record<string, string>, branding?: Branding }} FlatBackgroundFile
 */

/** Longueur maximale d'un nom de preset — borne UI (liste lisible), pas une contrainte technique. */
export const PRESET_NAME_MAX_LENGTH = 60;
export const PRESET_ID_MAX_LENGTH = 80;
const PRESET_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
const RETIRED_BACKGROUND_COMPONENT = 'MatrixGridBackground';

/**
 * Version du fichier d'état : 2 = valeurs persistées neutres (`audioReactive` booléen) ; 3 = `scenes` (documents de
 * scène, `scene-doc.js`) à la place de `presets`, `current` devenu la scène en antenne ; 4 = le branding est une couche
 * de la scène (type `branding`) au lieu de l'indicateur `showBranding` de la scène.
 */
export const BACKGROUND_FILE_VERSION = 4;


/**
 * Forme persistée d'un état courant : identifiant neutre de l'effet et options aux valeurs neutres.
 * Ne valide rien : un nom inconnu est laissé tel quel pour que la validation le signale.
 * @template {{ component: string | null, options: Record<string, unknown>, showBranding?: boolean }} T
 * @param {T} current
 * @returns {T}
 */
export function canonicalBackgroundCurrent(current) {
  if (!isPlainObject(current)) return current;
  const component = resolveKindId(current.component) ?? current.component;
  const options = isPlainObject(current.options)
    ? clampOptions(component, neutralizeOptions(current.options))
    : current.options;
  // Le branding affiché est l'état par défaut : seul « masqué » s'écrit (une scène sans couche branding).
  const { showBranding, ...rest } = current;
  return /** @type {T} */ ({ ...rest, component, options, ...(showBranding === undefined || showBranding === true ? {} : { showBranding }) });
}

/**
 * @template {{ component: string, options: Record<string, unknown> }} T
 * @param {T} preset
 * @returns {T}
 */
export function canonicalBackgroundPreset(preset) {
  return canonicalBackgroundCurrent(/** @type {*} */ (preset));
}

/**
 * Un état lu sur un serveur qui n'a pas encore migré son fichier, ramené à la forme neutre.
 * @template {{ current?: unknown, presets?: unknown }} T
 * @param {T} file
 * @returns {T}
 */
export function canonicalBackgroundState(file) {
  if (!isPlainObject(file)) return file;
  return {
    ...file,
    current: canonicalBackgroundCurrent(/** @type {*} */ (file.current)),
    presets: Array.isArray(file.presets) ? file.presets.map(canonicalBackgroundPreset) : file.presets,
  };
}

/**
 * La scène en antenne sans aucune couche : ni fond ni branding.
 * @returns {SceneDoc}
 */
export function emptyLiveScene() {
  return { version: SCENE_DOC_VERSION, ...CURRENT_SCENE, layers: [] };
}

/** @returns {BackgroundFile} */
export function defaultBackgroundFile() {
  return { version: BACKGROUND_FILE_VERSION, current: sceneFromCurrent({ component: 'dotgrid', options: {} }), scenes: [], sceneMap: {} };
}

/**
 * Branding d'un fichier d'état, prêt à afficher. Absent des fichiers écrits avant ⑤ : les valeurs
 * par défaut n'affichent rien, donc un état existant ne change pas d'apparence.
 * @param {unknown} file
 * @returns {Branding}
 */
export function readBranding(file) {
  return normalizeBranding(isPlainObject(file) ? file.branding : undefined);
}

/**
 * Table d'association scène OBS → preset d'un fichier d'état. Absente des fichiers écrits avant ③,
 * elle vaut `{}` : un état déjà sur disque reste valide sans migration.
 * @param {unknown} file
 * @returns {Record<string, string>}
 */
export function readSceneMap(file) {
  const raw = isPlainObject(file) ? file.sceneMap : undefined;
  return raw !== undefined && validateSceneMap(raw).ok ? /** @type {Record<string, string>} */ (raw) : {};
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Produit un identifiant lisible et stable pour les URL OBS. Les collisions sont suffixées dans
 * l'ordre d'insertion ; renommer ensuite le preset ne change jamais cet identifiant.
 * @param {string} name
 * @param {{ id?: string }[]} [presets]
 */
export function createPresetId(name, presets = []) {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'preset';
  const base = normalized.slice(0, PRESET_ID_MAX_LENGTH).replace(/-+$/g, '') || 'preset';
  const used = new Set(presets.map(({ id }) => id).filter((id) => typeof id === 'string'));
  if (!used.has(base)) return base;

  for (let suffix = 2; ; suffix += 1) {
    const ending = `-${suffix}`;
    const candidate = `${base.slice(0, PRESET_ID_MAX_LENGTH - ending.length).replace(/-+$/g, '')}${ending}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Migration explicite du format historique sans `id` et des effets retirés. Les autres erreurs
 * restent intactes et seront signalées par `validateBackgroundFile`.
 * @param {unknown} raw
 * @returns {{ file: any, migrated: boolean }}
 */
export function migrateBackgroundFile(raw) {
  if (!isPlainObject(raw) || !Array.isArray(raw.presets)) return { file: raw, migrated: false };

  let migrated = false;
  const needsNeutralValues = raw.version === undefined;
  const survivingPresets = raw.presets.filter((preset) => {
    const retired = isPlainObject(preset) && preset.component === RETIRED_BACKGROUND_COMPONENT;
    if (retired) migrated = true;
    return !retired;
  });
  const used = survivingPresets
    .filter(isPlainObject)
    .map((preset) => preset.id)
    .filter((id) => typeof id === 'string')
    .map((id) => ({ id: /** @type {string} */ (id) }));
  const presets = survivingPresets.map((preset) => {
    if (!isPlainObject(preset) || preset.id !== undefined || typeof preset.name !== 'string' || preset.name.length === 0) return preset;
    const id = createPresetId(preset.name, used);
    used.push({ id });
    migrated = true;
    return { id, ...preset };
  });
  const retireCurrent = isPlainObject(raw.current)
    && raw.current.component === RETIRED_BACKGROUND_COMPONENT;
  if (retireCurrent) migrated = true;
  const current = retireCurrent ? { component: null, options: {} } : raw.current;
  if (raw.version === 2) return { file: { ...raw, version: BACKGROUND_FILE_VERSION, current, presets }, migrated: true };
  if (!needsNeutralValues) return { file: migrated ? { ...raw, current, presets } : raw, migrated };

  return {
    file: {
      ...raw,
      version: BACKGROUND_FILE_VERSION,
      current: canonicalBackgroundCurrent(/** @type {*} */ (current)),
      presets: presets.map((entry) => (isPlainObject(entry) ? canonicalBackgroundPreset(/** @type {*} */ (entry)) : entry)),
    },
    migrated: true,
  };
}

/**
 * Un fichier plat (versions 1 et 2, déjà migré) comme fichier de scènes.
 * @param {FlatBackgroundFile} flat
 * @returns {BackgroundFile}
 */
function fileFromFlat(flat) {
  const { current, presets, ...rest } = flat;
  return { ...rest, current: sceneFromCurrent(current), scenes: presets.map((preset) => sceneFromPreset(preset)) };
}

/** @param {SceneDoc} scene @returns {SceneDoc | null} `null` : ni fond ni branding, la forme persistée de la scène vide */
const persistedScene = (scene) => (scene.layers.length === 0 ? null : scene);

/**
 * Forme persistée (version 4) d'un fichier d'état : celle du modèle, hormis la scène vide (`null`) de l'antenne, de
 * l'historique.
 * @param {BackgroundFile} file
 * @returns {Record<string, unknown>}
 */
export function encodePersistedFile(file) {
  const { current, history, drafts, ...rest } = file;
  return {
    ...rest,
    version: BACKGROUND_FILE_VERSION,
    current: persistedScene(current),
    ...(history === undefined ? {} : { history: history.map((entry) => ({ at: entry.at, scene: persistedScene(entry.scene) })) }),
    ...(drafts === undefined ? {} : { drafts }),
  };
}

/**
 * Inverse de `encodePersistedFile`. Toute scène valide se lit, quel que soit le nombre de ses couches.
 * @param {Record<string, unknown>} raw fichier de version 4
 * @returns {{ ok: true, file: BackgroundFile } | { ok: false, errors: string[] }}
 */
export function decodePersistedFile(raw) {
  /** @type {string[]} */
  const errors = [];
  /** @param {unknown} value @param {string} where @param {boolean} live la scène en antenne et celles de l'historique peuvent être vides (`null`) @returns {SceneDoc} */
  const readScene = (value, where, live) => {
    if (value === null && live) return emptyLiveScene();
    const validation = validateSceneDoc(value);
    if (!validation.ok) for (const error of validation.errors) errors.push(`${where} : ${error}`);
    return /** @type {SceneDoc} */ (value);
  };

  const current = readScene(raw.current, 'current', true);
  /** @type {HistoryEntry[] | undefined} */
  let history;
  if (raw.history !== undefined) {
    if (!Array.isArray(raw.history)) errors.push('history : tableau attendu');
    else {
      history = raw.history.map((entry, index) => ({
        at: isPlainObject(entry) ? /** @type {string} */ (entry.at) : '',
        scene: readScene(isPlainObject(entry) ? entry.scene ?? null : null, `history[${index}]`, true),
      }));
    }
  }
  if (!Array.isArray(raw.scenes)) errors.push('scenes : tableau attendu');
  const scenes = Array.isArray(raw.scenes) ? raw.scenes.map((scene, index) => readScene(scene, `scenes[${index}]`, false)) : [];
  /** @type {Drafts | undefined} */
  let drafts;
  if (raw.drafts !== undefined) {
    if (!isPlainObject(raw.drafts)) errors.push('drafts : objet attendu');
    else {
      drafts = Object.fromEntries(Object.entries(raw.drafts).map(([id, entry]) => [id, {
        at: isPlainObject(entry) ? /** @type {string} */ (entry.at) : '',
        scene: readScene(isPlainObject(entry) ? entry.scene : undefined, `drafts[${id}]`, false),
      }]));
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const { current: _current, scenes: _scenes, history: _history, drafts: _drafts, ...rest } = raw;
  return { ok: true, file: /** @type {BackgroundFile} */ ({ ...rest, current, scenes, ...(history === undefined ? {} : { history }), ...(drafts === undefined ? {} : { drafts }) }) };
}

/** @returns {Record<string, unknown>} la couche de branding d'une scène qui l'affichait (`showBranding` absent ou vrai) */
function brandingLayerRaw() {
  return { id: BRANDING_LAYER_ID, kind: 'branding', visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: {} };
}

/**
 * Une scène de version 3 en version 4 : l'indicateur `showBranding` devient une couche `branding` en dernier (au-dessus),
 * ou rien s'il valait faux.
 * @param {unknown} scene
 */
function upgradeScene(scene) {
  if (!isPlainObject(scene)) return scene;
  const { showBranding, ...rest } = scene;
  const layers = Array.isArray(rest.layers) ? rest.layers : [];
  const already = layers.some((layer) => isPlainObject(layer) && layer.kind === 'branding');
  return { ...rest, layers: showBranding === false || already ? layers : [...layers, brandingLayerRaw()] };
}

/**
 * Fichier persisté de version 3 en version 4. Un état « aucun fond » (`null`) affichait le branding : il devient une
 * scène du seul branding, sans quoi le branding disparaîtrait de l'antenne.
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, unknown>}
 */
export function upgradePersistedV3(raw) {
  const noBackground = () => ({ version: SCENE_DOC_VERSION, ...CURRENT_SCENE, layers: [brandingLayerRaw()] });
  const orNoBackground = (/** @type {unknown} */ scene) => (scene === null ? noBackground() : upgradeScene(scene));
  return {
    ...raw,
    version: 4,
    current: orNoBackground(raw.current),
    ...(Array.isArray(raw.scenes) ? { scenes: raw.scenes.map(upgradeScene) } : {}),
    ...(Array.isArray(raw.history)
      ? { history: raw.history.map((entry) => (isPlainObject(entry) ? { ...entry, scene: orNoBackground(entry.scene ?? null) } : entry)) }
      : {}),
    ...(isPlainObject(raw.drafts)
      ? { drafts: Object.fromEntries(Object.entries(raw.drafts).map(([id, entry]) => [id, isPlainObject(entry) ? { ...entry, scene: upgradeScene(entry.scene) } : entry])) }
      : {}),
  };
}

/**
 * Lecture tolérante du fichier d'état, de n'importe quelle version : la version 4 se décode, la 3 se met à niveau
 * puis se décode, les plus anciennes se migrent puis se convertissent en scènes. `migratedFrom` dit si le fichier doit
 * être réécrit en version 4 (et d'où il vient).
 * @param {unknown} raw
 * @returns {{ ok: true, file: BackgroundFile, migratedFrom: number | null } | { ok: false, errors: string[] }}
 */
export function readBackgroundFile(raw) {
  if (isPlainObject(raw) && (raw.version === BACKGROUND_FILE_VERSION || raw.version === 3)) {
    const upgraded = raw.version === 3;
    const decoded = decodePersistedFile(upgraded ? upgradePersistedV3(raw) : raw);
    if (!decoded.ok) return decoded;
    const validation = validateSceneFile(decoded.file);
    return validation.ok ? { ok: true, file: decoded.file, migratedFrom: upgraded ? 3 : null } : { ok: false, errors: validation.errors };
  }
  const migration = migrateBackgroundFile(raw);
  const validation = validateBackgroundFile(migration.file);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  const from = isPlainObject(raw) && typeof raw.version === 'number' ? raw.version : 1;
  return { ok: true, file: fileFromFlat(migration.file), migratedFrom: from };
}

/**
 * Valide un état courant `{ component, options }`. `component: null` = aucun fond (valide).
 * Ne lève jamais (même convention que `validateSceneConfig`).
 * @param {unknown} current
 * @returns {import('../types.js').ValidationResult}
 */
export function validateBackgroundCurrent(current) {
  /** @type {string[]} */
  const errors = [];
  if (!isPlainObject(current)) return { ok: false, errors: ['état courant : objet attendu'] };

  const { component, options } = current;
  if (component !== null && typeof component !== 'string') {
    errors.push('component : null ou chaîne attendu');
  } else if (typeof component === 'string' && !isKnownKindId(component)) {
    errors.push(`effet de fond inconnu : ${component}`);
  }
  if (!isPlainObject(options)) errors.push('options : objet attendu');
  else errors.push(...validateOptions(component, options));
  errors.push(...validateTransition(current.transition).errors);
  if (current.showBranding !== undefined && typeof current.showBranding !== 'boolean') {
    errors.push('showBranding : booléen attendu');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Valide un nom de preset (après trim côté appelant — un nom avec espaces autour est rejeté,
 * pas corrigé silencieusement).
 * @param {unknown} name
 * @returns {import('../types.js').ValidationResult}
 */
export function validatePresetName(name) {
  /** @type {string[]} */
  const errors = [];
  if (typeof name !== 'string' || name.length === 0) errors.push('nom de preset : chaîne non vide attendue');
  else {
    if (name !== name.trim()) errors.push('nom de preset : espaces en début/fin interdits');
    if (name.length > PRESET_NAME_MAX_LENGTH) errors.push(`nom de preset : ${PRESET_NAME_MAX_LENGTH} caractères maximum`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Valide un preset complet. `component: null` est interdit ici — un preset « aucun fond »
 * n'a pas de sens (il n'y a rien à rappeler).
 * @param {unknown} preset
 * @returns {import('../types.js').ValidationResult}
 */
export function validateBackgroundPreset(preset) {
  if (!isPlainObject(preset)) return { ok: false, errors: ['preset : objet attendu'] };

  const errors = [...validatePresetName(preset.name).errors];
  if (typeof preset.id !== 'string' || !PRESET_ID_PATTERN.test(preset.id) || preset.id.length > PRESET_ID_MAX_LENGTH) {
    errors.push('id de preset : identifiant URL attendu (minuscules, chiffres et tirets)');
  }
  if (!isKnownKindId(preset.component)) {
    errors.push(`effet de fond inconnu : ${preset.component}`);
  }
  if (!isPlainObject(preset.options)) errors.push('options : objet attendu');
  else errors.push(...validateOptions(preset.component, preset.options));
  errors.push(...validateTransition(preset.transition).errors);
  if (preset.showBranding !== undefined && typeof preset.showBranding !== 'boolean') {
    errors.push('showBranding : booléen attendu');
  }
  if (preset.tags !== undefined && (!Array.isArray(preset.tags)
    || preset.tags.some((tag) => typeof tag !== 'string' || tag.length === 0 || tag !== tag.trim()))) {
    errors.push('tags : tableau de chaînes non vides attendu');
  }

  return { ok: errors.length === 0, errors };
}

/** @param {unknown[]} values @returns {string[]} les valeurs textuelles qui reviennent */
function duplicated(values) {
  return [...new Set(values.filter((value, index) => typeof value === 'string' && values.indexOf(value) !== index))].map(String);
}

/** @param {unknown} scene @returns {boolean} la scène porte au moins une couche d'effet (le branding seul n'est pas un fond) */
export function hasEffectLayer(scene) {
  return isPlainObject(scene) && Array.isArray(scene.layers)
    && scene.layers.some((layer) => isPlainObject(layer) && !isIdentityKind(/** @type {string} */ (layer.kind)));
}

/**
 * Valide une scène nommée (un preset) : le document de scène, puis ce que la bibliothèque exige en plus — nom lisible,
 * identifiant d'URL, étiquettes, au moins un effet.
 * @param {unknown} scene
 * @returns {string[]}
 */
export function validateNamedScene(scene) {
  const validation = validateSceneDoc(scene);
  if (!validation.ok) return validation.errors;
  const named = /** @type {SceneDoc} */ (scene);
  const errors = [...validatePresetName(named.name).errors];
  if (!PRESET_ID_PATTERN.test(named.id) || named.id.length > PRESET_ID_MAX_LENGTH) {
    errors.push('id de preset : identifiant URL attendu (minuscules, chiffres et tirets)');
  }
  if (named.tags !== undefined && named.tags.some((tag) => tag.length === 0 || tag !== tag.trim())) {
    errors.push('tags : tableau de chaînes non vides attendu');
  }
  if (!hasEffectLayer(named)) errors.push('un effet est requis');
  return errors;
}

/**
 * Valide le modèle complet du fichier d'état. Un fichier invalide est une erreur à faire remonter, jamais à réparer
 * silencieusement (voir spec §État persisté).
 * @param {unknown} raw
 * @returns {import('../types.js').ValidationResult}
 */
export function validateSceneFile(raw) {
  if (!isPlainObject(raw)) return { ok: false, errors: ['fichier d\'état : objet attendu'] };

  /** @param {unknown} scene @returns {string[]} */
  const liveErrors = (scene) => {
    const validation = validateSceneDoc(scene, { allowEmpty: true });
    return validation.ok ? [] : validation.errors;
  };
  /** @type {string[]} */
  const errors = liveErrors(raw.current).map((error) => `current : ${error}`);
  errors.push(...validateBranding(raw.branding).errors);
  const studio = validateStudioSettings(raw.studio);
  if (!studio.ok) errors.push(...studio.errors.map((error) => `studio : ${error}`));
  errors.push(...validateHistory(raw.history, liveErrors));
  const scenes = Array.isArray(raw.scenes) ? raw.scenes : null;
  errors.push(...validateDrafts(raw.drafts, {
    presetIds: new Set((scenes ?? []).map((scene) => (isPlainObject(scene) ? scene.id : undefined)).filter((id) => typeof id === 'string')),
    validateScene: (scene) => (hasEffectLayer(scene) ? liveErrors(scene) : ['un effet est requis']),
  }));
  if (raw.sceneMap !== undefined) {
    for (const err of validateSceneMap(raw.sceneMap).errors) errors.push(`sceneMap : ${err}`);
  }
  if (scenes === null) errors.push('scenes : tableau attendu');
  else {
    scenes.forEach((scene, index) => {
      for (const err of validateNamedScene(scene)) errors.push(`scenes[${index}] : ${err}`);
    });
    const names = scenes.map((scene) => (isPlainObject(scene) ? scene.name : undefined));
    for (const name of duplicated(names)) errors.push(`preset en double : ${name}`);
    const ids = scenes.map((scene) => (isPlainObject(scene) ? scene.id : undefined));
    for (const id of duplicated(ids)) errors.push(`id de preset en double : ${id}`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Valide un fichier plat — les versions antérieures à 3 et les lots d'import de presets.
 * @param {unknown} raw
 * @returns {import('../types.js').ValidationResult}
 */
export function validateBackgroundFile(raw) {
  if (!isPlainObject(raw)) return { ok: false, errors: ['fichier d\'état : objet attendu'] };

  /** @type {string[]} */
  const errors = [...validateBackgroundCurrent(raw.current).errors];
  for (const err of validateBranding(raw.branding).errors) errors.push(err);
  if (raw.sceneMap !== undefined) {
    for (const err of validateSceneMap(raw.sceneMap).errors) errors.push(`sceneMap : ${err}`);
  }
  if (!Array.isArray(raw.presets)) errors.push('presets : tableau attendu');
  else {
    raw.presets.forEach((preset, index) => {
      for (const err of validateBackgroundPreset(preset).errors) errors.push(`presets[${index}] : ${err}`);
    });
    const names = raw.presets.map((p) => isPlainObject(p) ? p.name : undefined);
    const duplicates = names.filter((name, index) => typeof name === 'string' && names.indexOf(name) !== index);
    for (const name of new Set(duplicates)) errors.push(`preset en double : ${name}`);
    const ids = raw.presets.map((p) => isPlainObject(p) ? p.id : undefined);
    const duplicateIds = ids.filter((id, index) => typeof id === 'string' && ids.indexOf(id) !== index);
    for (const id of new Set(duplicateIds)) errors.push(`id de preset en double : ${id}`);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Ajoute une scène, ou remplace celle du même identifiant stable.
 * Retourne un nouveau tableau, sans muter l'entrée.
 * @param {SceneDoc[]} scenes
 * @param {SceneDoc} scene
 * @returns {SceneDoc[]}
 */
export function upsertScene(scenes, scene) {
  const existingIndex = scenes.findIndex((candidate) => candidate.id === scene.id);
  if (existingIndex === -1) return [...scenes, scene];
  return scenes.map((candidate, index) => (index === existingIndex ? scene : candidate));
}

/** @param {SceneDoc[]} scenes @param {string} id @param {string} name */
export function renameScene(scenes, id, name) {
  return scenes.map((scene) => (scene.id === id ? { ...scene, name } : scene));
}

/**
 * Prépare une copie autonome d'une scène, ou `null` si l'identifiant n'existe pas.
 * @param {SceneDoc[]} scenes
 * @param {string} id
 * @returns {SceneDoc | null}
 */
export function duplicateScene(scenes, id) {
  const source = scenes.find((scene) => scene.id === id);
  if (source === undefined) return null;

  const usedNames = new Set(scenes.map(({ name }) => name));
  const copyName = (suffix = '') => {
    const ending = ` — copie${suffix}`;
    return `${source.name.slice(0, PRESET_NAME_MAX_LENGTH - ending.length).trimEnd()}${ending}`;
  };
  let name = copyName();
  for (let suffix = 2; usedNames.has(name); suffix += 1) name = copyName(` ${suffix}`);
  return { ...structuredClone(source), id: createPresetId(name, scenes), name };
}

/**
 * Retire la scène portant cet identifiant. Retourne un nouveau tableau (l'existence est vérifiée par
 * l'appelant, qui en fait un 404 — même découpage que `removeSceneFromManifest`).
 * @param {SceneDoc[]} scenes
 * @param {string} id
 * @returns {SceneDoc[]}
 */
export function removeScene(scenes, id) {
  return scenes.filter((scene) => scene.id !== id);
}
