// @ts-check
import { clampOptions, isKnownKindId, neutralizeOptions, resolveKindId, validateOptions } from '../layer-kinds.js';
import { validateSceneMap } from '../obs-scene-mapping.js';
import { validateTransition } from '../background-transition.js';
import { normalizeBranding, validateBranding } from '../branding-format.js';
import { presetFromScene, sceneFromCurrent, sceneFromPreset, validateSceneDoc } from '../scene-doc.js';

/**
 * dev/background-state-format.js — Logique pure de l'état background standalone (2026-07-14).
 *
 * Validation et transformations du fichier `dev/data/background-state.json`, consommé par
 * `background-state-server.js` (voir docs/specs/background-standalone.md). Aucune I/O ici —
 * testable sans serveur (même découpage AD-1 que `scene-data-format.js`).
 *
 * @typedef {import('../background-transition.js').BackgroundTransition} BackgroundTransition
 * @typedef {{ component: string | null, options: Record<string, unknown>, transition?: BackgroundTransition, showBranding?: boolean }} BackgroundCurrent
 * @typedef {{ id: string, name: string, component: string, options: Record<string, unknown>, tags?: string[], transition?: BackgroundTransition, showBranding?: boolean }} BackgroundPreset
 * @typedef {import('../branding-format.js').Branding} Branding
 * @typedef {{ version?: number, current: BackgroundCurrent, presets: BackgroundPreset[], sceneMap?: Record<string, string>, branding?: Branding }} BackgroundFile
 */

/** Longueur maximale d'un nom de preset — borne UI (liste lisible), pas une contrainte technique. */
export const PRESET_NAME_MAX_LENGTH = 60;
export const PRESET_ID_MAX_LENGTH = 80;
const PRESET_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
const RETIRED_BACKGROUND_COMPONENT = 'MatrixGridBackground';

/**
 * Version du fichier d'état : 2 = valeurs persistées neutres (`audioReactive` booléen) ; 3 = `scenes` (documents de
 * scène, `scene-doc.js`) à la place de `presets`, `current` devenu la scène en antenne.
 */
export const BACKGROUND_FILE_VERSION = 3;


/**
 * Forme persistée d'un état courant : identifiant neutre de l'effet et options aux valeurs neutres.
 * Ne valide rien : un nom inconnu est laissé tel quel pour que la validation le signale.
 * @template {{ component: string | null, options: Record<string, unknown> }} T
 * @param {T} current
 * @returns {T}
 */
export function canonicalBackgroundCurrent(current) {
  if (!isPlainObject(current)) return current;
  const component = resolveKindId(current.component) ?? current.component;
  const options = isPlainObject(current.options)
    ? clampOptions(component, neutralizeOptions(current.options))
    : current.options;
  return { ...current, component, options };
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

/** @returns {BackgroundFile} */
export function defaultBackgroundFile() {
  return { version: BACKGROUND_FILE_VERSION, current: { component: 'dotgrid', options: {} }, presets: [], sceneMap: {} };
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
 * Forme persistée (version 3) d'un fichier d'état : chaque preset est une scène à une couche, l'état courant est la
 * scène en antenne (`null` : aucun fond). Le reste du serveur manipule la forme `current` / `presets`.
 * @param {BackgroundFile} file
 * @returns {Record<string, unknown>}
 */
export function encodePersistedFile(file) {
  const { current, presets, ...rest } = file;
  return {
    ...rest,
    version: BACKGROUND_FILE_VERSION,
    current: current.component === null ? null : sceneFromCurrent(current),
    scenes: presets.map((preset) => sceneFromPreset(preset)),
  };
}

/**
 * Inverse de `encodePersistedFile`. Une scène qui n'est pas à une couche ne se lit pas encore : le serveur et le
 * Studio n'ont pas d'éditeur de couches, et la prendre pour un preset en perdrait.
 * @param {Record<string, unknown>} raw fichier de version 3
 * @returns {{ ok: true, file: BackgroundFile } | { ok: false, errors: string[] }}
 */
export function decodePersistedFile(raw) {
  /** @type {string[]} */
  const errors = [];
  /** @param {unknown} value @param {string} where */
  const readScene = (value, where) => {
    const validation = validateSceneDoc(value);
    if (!validation.ok) {
      for (const error of validation.errors) errors.push(`${where} : ${error}`);
      return null;
    }
    const preset = presetFromScene(/** @type {*} */ (value));
    if (preset === null) errors.push(`${where} : scène à plusieurs couches, non prise en charge par ce serveur`);
    return preset;
  };

  /** @type {BackgroundCurrent} */
  let current = { component: null, options: {} };
  if (raw.current !== null) {
    const scene = readScene(raw.current, 'current');
    if (scene !== null) {
      current = { component: scene.component, options: scene.options };
      if (scene.transition !== undefined) current.transition = scene.transition;
      if (scene.showBranding !== undefined) current.showBranding = scene.showBranding;
    }
  }
  if (!Array.isArray(raw.scenes)) errors.push('scenes : tableau attendu');
  const presets = Array.isArray(raw.scenes)
    ? raw.scenes.map((scene, index) => readScene(scene, `scenes[${index}]`)).filter((preset) => preset !== null)
    : [];
  if (errors.length > 0) return { ok: false, errors };

  const { current: _current, scenes: _scenes, ...rest } = raw;
  return { ok: true, file: /** @type {BackgroundFile} */ ({ ...rest, current, presets }) };
}

/**
 * Lecture tolérante du fichier d'état, de n'importe quelle version : la version 3 se décode, les anciennes
 * se migrent. `migratedFrom` dit si le fichier doit être réécrit en version 3 (et d'où il vient).
 * @param {unknown} raw
 * @returns {{ ok: true, file: BackgroundFile, migratedFrom: number | null } | { ok: false, errors: string[] }}
 */
export function readBackgroundFile(raw) {
  if (isPlainObject(raw) && raw.version === BACKGROUND_FILE_VERSION) {
    const decoded = decodePersistedFile(raw);
    if (!decoded.ok) return decoded;
    const validation = validateBackgroundFile(decoded.file);
    return validation.ok ? { ok: true, file: decoded.file, migratedFrom: null } : { ok: false, errors: validation.errors };
  }
  const migration = migrateBackgroundFile(raw);
  const validation = validateBackgroundFile(migration.file);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  const from = isPlainObject(raw) && typeof raw.version === 'number' ? raw.version : 1;
  return { ok: true, file: migration.file, migratedFrom: migration.migrated ? from : null };
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

/**
 * Valide la forme complète du fichier persisté. Un fichier invalide est une erreur à faire
 * remonter, jamais à réparer silencieusement (voir spec §État persisté).
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
 * Ajoute un preset, ou remplace celui du même identifiant stable.
 * Retourne un nouveau tableau, sans muter l'entrée.
 * @param {BackgroundPreset[]} presets
 * @param {BackgroundPreset} preset
 * @returns {BackgroundPreset[]}
 */
export function upsertPreset(presets, preset) {
  const existingIndex = presets.findIndex((p) => p.id === preset.id);
  if (existingIndex === -1) return [...presets, preset];
  return presets.map((p, index) => (index === existingIndex ? preset : p));
}

/** @param {BackgroundPreset[]} presets @param {string} id @param {string} name */
export function renamePreset(presets, id, name) {
  return presets.map((preset) => preset.id === id ? { ...preset, name } : preset);
}

/**
 * Prépare une copie autonome d'un preset, ou `null` si l'identifiant n'existe pas.
 * @param {BackgroundPreset[]} presets
 * @param {string} id
 * @returns {BackgroundPreset | null}
 */
export function duplicatePreset(presets, id) {
  const source = presets.find((preset) => preset.id === id);
  if (source === undefined) return null;

  const usedNames = new Set(presets.map(({ name }) => name));
  const copyName = (suffix = '') => {
    const ending = ` — copie${suffix}`;
    return `${source.name.slice(0, PRESET_NAME_MAX_LENGTH - ending.length).trimEnd()}${ending}`;
  };
  let name = copyName();
  for (let suffix = 2; usedNames.has(name); suffix += 1) name = copyName(` ${suffix}`);
  return {
    ...source,
    id: createPresetId(name, presets),
    name,
    options: { ...source.options },
    ...(source.tags === undefined ? {} : { tags: [...source.tags] }),
  };
}

/**
 * Retire le preset portant cet identifiant. Retourne un nouveau tableau (l'existence est vérifiée par
 * l'appelant, qui en fait un 404 — même découpage que `removeSceneFromManifest`).
 * @param {BackgroundPreset[]} presets
 * @param {string} id
 * @returns {BackgroundPreset[]}
 */
export function removePreset(presets, id) {
  return presets.filter((p) => p.id !== id);
}
