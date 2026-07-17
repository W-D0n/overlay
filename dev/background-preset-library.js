// @ts-check
import { PRESET_NAME_MAX_LENGTH, validateBackgroundFile } from './background-state-format.js';

export const BACKGROUND_PRESET_BUNDLE_FORMAT = 'overlay-background-presets';
export const BACKGROUND_PRESET_BUNDLE_VERSION = 1;

/**
 * @typedef {object} BackgroundPresetBundle
 * @property {'overlay-background-presets'} format
 * @property {1} version
 * @property {import('./background-state-format.js').BackgroundPreset[]} presets
 */

/** @param {unknown} value */
function searchable(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Recherche homogène dans les bibliothèques Atelier et personnelle.
 * @param {import('./background-state-format.js').BackgroundPreset[]} presets
 * @param {string} query
 */
export function filterBackgroundPresets(presets, query) {
  const needle = searchable(query).trim();
  if (needle === '') return presets;
  return presets.filter((preset) => searchable([
    preset.name,
    preset.component.replace(/Background$/, ''),
    ...(preset.tags ?? []),
  ].join(' ')).includes(needle));
}

/** @param {import('./background-state-format.js').BackgroundPreset} preset */
function clonePreset(preset) {
  return {
    id: preset.id,
    name: preset.name,
    component: preset.component,
    options: structuredClone(preset.options),
    ...(preset.tags === undefined ? {} : { tags: [...preset.tags] }),
  };
}

/**
 * Empreinte courte du contenu courant, utilisée comme verrou optimiste entre aperçu et import.
 * @param {import('./background-state-format.js').BackgroundPreset[]} presets
 */
export function backgroundPresetRevision(presets) {
  const serialized = JSON.stringify(presets);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * @param {import('./background-state-format.js').BackgroundPreset[]} presets
 * @returns {BackgroundPresetBundle}
 */
export function createBackgroundPresetBundle(presets) {
  return {
    format: BACKGROUND_PRESET_BUNDLE_FORMAT,
    version: BACKGROUND_PRESET_BUNDLE_VERSION,
    presets: presets.map(clonePreset),
  };
}

/**
 * @param {unknown} input
 * @returns {{ok:true,presets:import('./background-state-format.js').BackgroundPreset[]}|{ok:false,errors:string[]}}
 */
export function parseBackgroundPresetBundle(input) {
  /** @type {unknown} */
  let raw = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      return { ok: false, errors: ['fichier de presets : JSON illisible'] };
    }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['fichier de presets : objet attendu'] };
  }
  const bundle = /** @type {Record<string, unknown>} */ (raw);
  if (bundle.format !== BACKGROUND_PRESET_BUNDLE_FORMAT) {
    return { ok: false, errors: [`format de presets inconnu : ${String(bundle.format)}`] };
  }
  if (bundle.version !== BACKGROUND_PRESET_BUNDLE_VERSION) {
    return { ok: false, errors: [`version de presets non supportée : ${String(bundle.version)}`] };
  }
  if (!Array.isArray(bundle.presets)) return { ok: false, errors: ['presets : tableau attendu'] };

  const validation = validateBackgroundFile({ current: { component: null, options: {} }, presets: bundle.presets });
  if (!validation.ok) return { ok: false, errors: validation.errors };
  return {
    ok: true,
    presets: /** @type {import('./background-state-format.js').BackgroundPreset[]} */ (bundle.presets).map(clonePreset),
  };
}

/**
 * Retrouve la nouvelle version du preset édité uniquement lorsque l'import vient de le modifier.
 * @param {import('./background-state-format.js').BackgroundPreset[]} merged
 * @param {{id:string}[]} imported
 * @param {string | null} activeId
 */
export function findImportedActivePreset(merged, imported, activeId) {
  if (activeId === null || !imported.some(({ id }) => id === activeId)) return null;
  return merged.find(({ id }) => id === activeId) ?? null;
}

/**
 * @param {string} requested
 * @param {import('./background-state-format.js').BackgroundPreset[]} presets
 * @param {string} importingId
 */
function uniqueImportedName(requested, presets, importingId) {
  const isAvailable = (name) => !presets.some((preset) => preset.id !== importingId && preset.name === name);
  if (isAvailable(requested)) return requested;
  for (let suffix = 1; ; suffix += 1) {
    const ending = ` — import${suffix === 1 ? '' : ` ${suffix}`}`;
    const candidate = `${requested.slice(0, PRESET_NAME_MAX_LENGTH - ending.length).trimEnd()}${ending}`;
    if (isAvailable(candidate)) return candidate;
  }
}

/**
 * Fusion atomique : un id connu est mis à jour, un id nouveau est ajouté. Un nom déjà porté par
 * un autre id est suffixé plutôt que d'écraser silencieusement ce preset.
 * @param {import('./background-state-format.js').BackgroundPreset[]} existing
 * @param {import('./background-state-format.js').BackgroundPreset[]} imported
 */
export function mergeBackgroundPresetImport(existing, imported) {
  const presets = existing.map(clonePreset);
  let created = 0;
  let updated = 0;
  let renamed = 0;

  for (const source of imported) {
    const name = uniqueImportedName(source.name, presets, source.id);
    if (name !== source.name) renamed += 1;
    const preset = clonePreset({ ...source, name });
    const existingIndex = presets.findIndex(({ id }) => id === preset.id);
    if (existingIndex === -1) {
      presets.push(preset);
      created += 1;
    } else {
      presets[existingIndex] = preset;
      updated += 1;
    }
  }

  return { presets, created, updated, renamed };
}
