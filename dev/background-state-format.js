// @ts-check
import { BACKGROUND_COMPONENT_NAMES } from './component-field-schemas.js';

/**
 * dev/background-state-format.js — Logique pure de l'état background standalone (2026-07-14).
 *
 * Validation et transformations du fichier `dev/data/background-state.json`, consommé par
 * `background-state-server.js` (voir docs/specs/background-standalone.md). Aucune I/O ici —
 * testable sans serveur (même découpage AD-1 que `scene-data-format.js`).
 *
 * @typedef {{ component: string | null, options: Record<string, unknown> }} BackgroundCurrent
 * @typedef {{ id: string, name: string, component: string, options: Record<string, unknown>, tags?: string[] }} BackgroundPreset
 * @typedef {{ current: BackgroundCurrent, presets: BackgroundPreset[] }} BackgroundFile
 */

/** Longueur maximale d'un nom de preset — borne UI (liste lisible), pas une contrainte technique. */
export const PRESET_NAME_MAX_LENGTH = 60;
export const PRESET_ID_MAX_LENGTH = 80;
const PRESET_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

/** @returns {BackgroundFile} */
export function defaultBackgroundFile() {
  return { current: { component: 'DotGridBackground', options: {} }, presets: [] };
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
 * Migration explicite du format historique sans `id`. Les autres erreurs restent intactes et
 * seront signalées par `validateBackgroundFile` : seule l'absence d'identifiant est réparée.
 * @param {unknown} raw
 * @returns {{ file: any, migrated: boolean }}
 */
export function migrateBackgroundFile(raw) {
  if (!isPlainObject(raw) || !Array.isArray(raw.presets)) return { file: raw, migrated: false };

  const used = raw.presets
    .filter(isPlainObject)
    .map((preset) => preset.id)
    .filter((id) => typeof id === 'string')
    .map((id) => ({ id: /** @type {string} */ (id) }));
  let migrated = false;
  const presets = raw.presets.map((preset) => {
    if (!isPlainObject(preset) || preset.id !== undefined || typeof preset.name !== 'string' || preset.name.length === 0) return preset;
    const id = createPresetId(preset.name, used);
    used.push({ id });
    migrated = true;
    return { id, ...preset };
  });
  return { file: migrated ? { ...raw, presets } : raw, migrated };
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
  } else if (typeof component === 'string' && !BACKGROUND_COMPONENT_NAMES.includes(component)) {
    errors.push(`effet de fond inconnu : ${component}`);
  }
  if (!isPlainObject(options)) errors.push('options : objet attendu');

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
  if (typeof preset.component !== 'string' || !BACKGROUND_COMPONENT_NAMES.includes(preset.component)) {
    errors.push(`effet de fond inconnu : ${preset.component}`);
  }
  if (!isPlainObject(preset.options)) errors.push('options : objet attendu');
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
