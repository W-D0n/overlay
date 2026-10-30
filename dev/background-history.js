// @ts-check
/**
 * dev/background-history.js — Historique des publications : les états qui ont quitté l'antenne.
 *
 * Chaque publication depuis le Studio qui change l'état en antenne range l'état remplacé en tête de l'historique
 * (le plus récent d'abord, `at` = l'instant du remplacement). Revenir en arrière remet un de ces états à l'antenne et
 * range à son tour celui qu'il remplace : un retour se défait comme une publication. Les changements de scène OBS ne
 * s'y inscrivent pas, ils se déduisent des presets et de la table d'association.
 *
 * Logique pure : ni disque, ni horloge (l'instant est fourni), ni réseau.
 *
 * @typedef {import('./background-state-format.js').BackgroundCurrent} BackgroundCurrent
 * @typedef {{ at: string, current: BackgroundCurrent }} HistoryEntry
 */

/** Nombre maximal d'états conservés : de quoi revenir sur une soirée, pas un journal. */
export const HISTORY_LIMIT = 20;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JSON dont l'ordre des clés ne compte pas : deux états égaux s'écrivent pareil. @param {unknown} value @returns {string} */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Deux états en antenne sont les mêmes quand effet, options, transition et branding sont les mêmes.
 * @param {BackgroundCurrent} a
 * @param {BackgroundCurrent} b
 */
export function sameCurrent(a, b) {
  return stableStringify(a) === stableStringify(b);
}

/**
 * L'instant identifie l'entrée (c'est ce que reçoit « revenir en arrière ») : il est décalé d'une milliseconde tant
 * qu'il existe déjà.
 * @param {{ history: readonly HistoryEntry[], replaced: BackgroundCurrent, next: BackgroundCurrent, at: string }} input
 * @returns {HistoryEntry[]} nouvel historique, borné ; inchangé si `next` est identique à `replaced`
 */
export function recordReplaced({ history, replaced, next, at }) {
  if (sameCurrent(replaced, next)) return [...history];
  let instant = Date.parse(at);
  while (history.some((entry) => entry.at === new Date(instant).toISOString())) instant += 1;
  return [{ at: new Date(instant).toISOString(), current: replaced }, ...history].slice(0, HISTORY_LIMIT);
}

/**
 * @param {readonly HistoryEntry[]} history
 * @param {string} at
 * @returns {HistoryEntry | null}
 */
export function findEntry(history, at) {
  return history.find((entry) => entry.at === at) ?? null;
}

/**
 * Forme de l'historique seulement ; la validité de chaque état est celle de `validateBackgroundCurrent`.
 * @param {unknown} raw
 * @param {(current: unknown) => string[]} validateCurrent
 * @returns {string[]}
 */
export function validateHistory(raw, validateCurrent) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return ['history : tableau attendu'];
  /** @type {string[]} */
  const errors = [];
  if (raw.length > HISTORY_LIMIT) errors.push(`history : ${HISTORY_LIMIT} états au plus`);
  const seen = new Set();
  raw.forEach((entry, index) => {
    const where = `history[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${where} : objet attendu`);
      return;
    }
    if (typeof entry.at !== 'string' || Number.isNaN(Date.parse(entry.at))) errors.push(`${where}.at : date ISO attendue`);
    else if (seen.has(entry.at)) errors.push(`${where}.at : instant en double`);
    else seen.add(entry.at);
    for (const error of validateCurrent(entry.current)) errors.push(`${where}.current : ${error}`);
  });
  return errors;
}
