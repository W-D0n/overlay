// @ts-check
import { PRESET_NAME_MAX_LENGTH, canonicalBackgroundPreset, validateBackgroundFile } from './background-state-format.js';
import { backgroundEffectLabel } from './component-field-schemas.js';

export const BACKGROUND_PRESET_BUNDLE_FORMAT = 'overlay-background-presets';
export const BACKGROUND_PRESET_BUNDLE_VERSION = 2;
/** Versions de lot lues à l'import : la 1 porte encore `audioReactive` « Oui » / « Non ». */
const READABLE_BUNDLE_VERSIONS = [1, 2];

/**
 * @typedef {object} BackgroundPresetBundle
 * @property {'overlay-background-presets'} format
 * @property {2} version
 * @property {import('./background-state-format.js').BackgroundPreset[]} presets
 */

/** @typedef {'created'|'updated'|'unchanged'} BackgroundPresetImportOperation */
/**
 * @typedef {
 *   {field:'name'|'component'|'tags'|'transition'|'showBranding',before?:unknown,after?:unknown}
 *   | {field:'option',key:string,before?:unknown,after?:unknown}
 * } BackgroundPresetImportDifference
 */
/** @typedef {{id:string,name:string}} BackgroundPresetImportConflict */
/**
 * @typedef {object} BackgroundPresetImportChange
 * @property {string} id
 * @property {BackgroundPresetImportOperation} operation
 * @property {string} name
 * @property {string} component
 * @property {string} requestedName
 * @property {boolean} renamed
 * @property {BackgroundPresetImportConflict|null} conflict
 * @property {BackgroundPresetImportDifference[]} differences
 */
/**
 * @typedef {object} BackgroundPresetImportPreview
 * @property {number} created
 * @property {number} updated
 * @property {number} renamed
 * @property {number} unchanged
 * @property {BackgroundPresetImportChange[]} changes
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
    backgroundEffectLabel(preset.component),
    ...(preset.tags ?? []),
  ].join(' ')).includes(needle));
}

/** @param {import('./background-state-format.js').BackgroundPreset} preset */
function clonePreset(preset) {
  return structuredClone(preset);
}

/**
 * @param {import('./background-state-format.js').BackgroundPreset} preset
 * @returns {BackgroundPresetImportDifference[]}
 */
function describeCreatedPreset(preset) {
  return [
    { field: 'component', after: preset.component },
    ...(preset.tags === undefined ? [] : [{ field: 'tags', after: [...preset.tags] }]),
    ...(preset.transition === undefined ? [] : [{ field: 'transition', after: structuredClone(preset.transition) }]),
    ...(preset.showBranding === undefined ? [] : [{ field: 'showBranding', after: preset.showBranding }]),
    ...Object.entries(preset.options).map(([key, after]) => ({
      field: 'option',
      key,
      after: structuredClone(after),
    })),
  ];
}

/** @param {unknown} left @param {unknown} right */
function samePresetValue(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => samePresetValue(value, right[index]));
  }
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
    return false;
  }
  const leftObject = /** @type {Record<string, unknown>} */ (left);
  const rightObject = /** @type {Record<string, unknown>} */ (right);
  const leftKeys = Object.keys(leftObject).sort();
  const rightKeys = Object.keys(rightObject).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index]
      && samePresetValue(leftObject[key], rightObject[key]));
}

/**
 * @param {import('./background-state-format.js').BackgroundPreset} before
 * @param {import('./background-state-format.js').BackgroundPreset} after
 * @returns {BackgroundPresetImportDifference[]}
 */
function describeUpdatedPreset(before, after) {
  /** @type {BackgroundPresetImportDifference[]} */
  const differences = [];
  if (before.name !== after.name) {
    differences.push({ field: 'name', before: before.name, after: after.name });
  }
  if (before.component !== after.component) {
    differences.push({ field: 'component', before: before.component, after: after.component });
  }
  const beforeTags = before.tags ?? [];
  const afterTags = after.tags ?? [];
  if (!samePresetValue(beforeTags, afterTags)) {
    differences.push({ field: 'tags', before: [...beforeTags], after: [...afterTags] });
  }
  for (const field of /** @type {const} */ (['transition', 'showBranding'])) {
    if (samePresetValue(before[field], after[field])) continue;
    differences.push({
      field,
      ...(before[field] === undefined ? {} : { before: structuredClone(before[field]) }),
      ...(after[field] === undefined ? {} : { after: structuredClone(after[field]) }),
    });
  }

  const optionKeys = [
    ...Object.keys(before.options),
    ...Object.keys(after.options).filter((key) => !Object.hasOwn(before.options, key)),
  ];
  for (const key of optionKeys) {
    const hasBefore = Object.hasOwn(before.options, key);
    const hasAfter = Object.hasOwn(after.options, key);
    if (hasBefore === hasAfter && samePresetValue(before.options[key], after.options[key])) continue;
    differences.push({
      field: 'option',
      key,
      ...(hasBefore ? { before: structuredClone(before.options[key]) } : {}),
      ...(hasAfter ? { after: structuredClone(after.options[key]) } : {}),
    });
  }
  return differences;
}

/**
 * Empreinte courte du contenu courant, utilisée comme verrou optimiste entre aperçu et import.
 * @param {readonly unknown[]} presets
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
  if (typeof bundle.version !== 'number' || !READABLE_BUNDLE_VERSIONS.includes(bundle.version)) {
    return { ok: false, errors: [`version de presets non supportée : ${String(bundle.version)}`] };
  }
  if (!Array.isArray(bundle.presets)) return { ok: false, errors: ['presets : tableau attendu'] };

  const validation = validateBackgroundFile({ current: { component: null, options: {} }, presets: bundle.presets });
  if (!validation.ok) return { ok: false, errors: validation.errors };
  return {
    ok: true,
    presets: /** @type {import('./background-state-format.js').BackgroundPreset[]} */ (bundle.presets)
      .map(clonePreset)
      .map(canonicalBackgroundPreset),
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
 * @param {{id:string,name:string}[]} presets
 * @param {string} importingId
 */
function uniqueImportedName(requested, presets, importingId) {
  const conflict = presets.find((preset) => preset.id !== importingId && preset.name === requested);
  if (conflict === undefined) return { name: requested, conflict: null };
  const isAvailable = (name) => !presets.some((preset) => preset.id !== importingId && preset.name === name);
  for (let suffix = 1; ; suffix += 1) {
    const ending = ` — import${suffix === 1 ? '' : ` ${suffix}`}`;
    const candidate = `${requested.slice(0, PRESET_NAME_MAX_LENGTH - ending.length).trimEnd()}${ending}`;
    if (isAvailable(candidate)) {
      return { name: candidate, conflict: { id: conflict.id, name: conflict.name } };
    }
  }
}

/**
 * @param {import('./background-state-format.js').BackgroundPreset} source
 * @param {import('./background-state-format.js').BackgroundPreset} preset
 * @param {{name:string,conflict:BackgroundPresetImportConflict|null}} resolution
 * @param {BackgroundPresetImportOperation} operation
 * @param {BackgroundPresetImportDifference[]} differences
 * @returns {BackgroundPresetImportChange}
 */
function createBackgroundPresetImportChange(source, preset, resolution, operation, differences) {
  return {
    id: preset.id,
    operation,
    name: preset.name,
    component: preset.component,
    requestedName: source.name,
    renamed: resolution.name !== source.name,
    conflict: resolution.conflict,
    differences,
  };
}

/**
 * Fusion atomique : un id connu est mis à jour, un id nouveau est ajouté. Un nom déjà porté par
 * un autre id est suffixé plutôt que d'écraser silencieusement ce preset. `reserved` : les scènes de la bibliothèque
 * que ce lot ne sait pas représenter — elles ne sont ni modifiées ni lues, mais leur nom reste pris.
 * @param {import('./background-state-format.js').BackgroundPreset[]} existing
 * @param {import('./background-state-format.js').BackgroundPreset[]} imported
 * @param {{id:string,name:string}[]} [reserved]
 */
export function mergeBackgroundPresetImport(existing, imported, reserved = []) {
  const presets = existing.map(clonePreset);
  let created = 0;
  let updated = 0;
  let renamed = 0;
  let unchanged = 0;
  /** @type {BackgroundPresetImportChange[]} */
  const changes = [];

  for (const source of imported) {
    const resolution = uniqueImportedName(source.name, [...presets, ...reserved], source.id);
    const { name } = resolution;
    if (name !== source.name) renamed += 1;
    const preset = clonePreset({ ...source, name });
    const existingIndex = presets.findIndex(({ id }) => id === preset.id);
    if (existingIndex === -1) {
      presets.push(preset);
      created += 1;
      changes.push(createBackgroundPresetImportChange(
        source,
        preset,
        resolution,
        'created',
        [
          ...(name === source.name
            ? []
            : [{ field: 'name', before: source.name, after: name }]),
          ...describeCreatedPreset(preset),
        ],
      ));
    } else {
      const previous = presets[existingIndex];
      const differences = describeUpdatedPreset(previous, preset);
      const operation = differences.length === 0 ? 'unchanged' : 'updated';
      if (operation === 'unchanged') {
        unchanged += 1;
      } else {
        presets[existingIndex] = preset;
        updated += 1;
      }
      changes.push(createBackgroundPresetImportChange(
        source,
        preset,
        resolution,
        operation,
        differences,
      ));
    }
  }

  return { presets, created, updated, renamed, unchanged, changes };
}
