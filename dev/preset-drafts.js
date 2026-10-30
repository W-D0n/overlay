// @ts-check
/**
 * dev/preset-drafts.js — Brouillons de presets : les réglages non enregistrés d'un preset existant.
 *
 * Un brouillon est rangé sous l'identifiant du preset ; il n'est jamais diffusé à l'antenne. Logique pure : ni disque,
 * ni horloge (l'instant est fourni).
 *
 * @typedef {import('./background-state-format.js').BackgroundCurrent} BackgroundCurrent
 * @typedef {{ at: string, state: BackgroundCurrent }} DraftEntry
 * @typedef {Record<string, DraftEntry>} Drafts
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {Drafts | undefined} drafts
 * @param {string} presetId
 * @param {BackgroundCurrent} state
 * @param {string} at
 * @returns {Drafts}
 */
export function withDraft(drafts, presetId, state, at) {
  return { ...drafts, [presetId]: { at, state } };
}

/**
 * @param {Drafts | undefined} drafts
 * @param {string} presetId
 * @returns {Drafts | undefined} `undefined` quand il n'en reste aucun : le fichier ne porte alors pas la clé
 */
export function withoutDraft(drafts, presetId) {
  if (drafts === undefined || !Object.hasOwn(drafts, presetId)) return drafts;
  const { [presetId]: _removed, ...rest } = drafts;
  return Object.keys(rest).length === 0 ? undefined : rest;
}

/**
 * Le fichier d'état avec ses brouillons remplacés ; sans brouillon, la clé disparaît.
 * @template {{ drafts?: Drafts }} F
 * @param {F} file
 * @param {Drafts | undefined} drafts
 * @returns {F}
 */
export function withDrafts(file, drafts) {
  const { drafts: _previous, ...rest } = file;
  return /** @type {F} */ (drafts === undefined ? rest : { ...rest, drafts });
}

/**
 * @param {unknown} raw
 * @param {{ presetIds: ReadonlySet<string>, validateState: (state: unknown) => string[] }} context
 * @returns {string[]}
 */
export function validateDrafts(raw, { presetIds, validateState }) {
  if (raw === undefined) return [];
  if (!isPlainObject(raw)) return ['drafts : objet attendu'];
  /** @type {string[]} */
  const errors = [];
  for (const [presetId, entry] of Object.entries(raw)) {
    const where = `drafts[${presetId}]`;
    if (!presetIds.has(presetId)) errors.push(`${where} : brouillon d'un preset inconnu`);
    if (!isPlainObject(entry)) {
      errors.push(`${where} : objet attendu`);
      continue;
    }
    if (typeof entry.at !== 'string' || Number.isNaN(Date.parse(entry.at))) errors.push(`${where}.at : date ISO attendue`);
    if (isPlainObject(entry.state) && entry.state.component === null) errors.push(`${where}.state : un effet est requis`);
    for (const error of validateState(entry.state)) errors.push(`${where}.state : ${error}`);
  }
  return errors;
}
