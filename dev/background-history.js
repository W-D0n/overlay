// @ts-check
/**
 * dev/background-history.js — Historique des publications : les états qui ont quitté l'antenne.
 *
 * Chaque publication depuis le Studio qui change la scène en antenne range la scène remplacée en tête de l'historique
 * (le plus récent d'abord, `at` = l'instant du remplacement). Revenir en arrière remet un de ces états à l'antenne et
 * range à son tour celui qu'il remplace : un retour se défait comme une publication. Les changements de scène OBS ne
 * s'y inscrivent pas, ils se déduisent des presets et de la table d'association.
 *
 * Logique pure : ni disque, ni horloge (l'instant est fourni), ni réseau.
 *
 * @typedef {import('../scene-doc.js').SceneDoc} SceneDoc
 * @typedef {{ at: string, scene: SceneDoc }} HistoryEntry
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
 * Deux scènes en antenne sont les mêmes quand leurs couches, leur transition et leurs étiquettes sont les mêmes ; leur
 * identité (`id`, `name`) ne compte pas : celle de la scène en antenne ne change jamais, celle d'un preset rappelé est
 * son nom.
 * @param {SceneDoc} a
 * @param {SceneDoc} b
 */
export function sameScene(a, b) {
  const { id: _a, name: _an, ...left } = a;
  const { id: _b, name: _bn, ...right } = b;
  return stableStringify(left) === stableStringify(right);
}

/**
 * L'instant identifie l'entrée (c'est ce que reçoit « revenir en arrière ») : il est décalé d'une milliseconde tant
 * qu'il existe déjà.
 * @param {{ history: readonly HistoryEntry[], replaced: SceneDoc, next: SceneDoc, at: string }} input
 * @returns {HistoryEntry[]} nouvel historique, borné ; inchangé si `next` est identique à `replaced`
 */
export function recordReplaced({ history, replaced, next, at }) {
  if (sameScene(replaced, next)) return [...history];
  let instant = Date.parse(at);
  while (history.some((entry) => entry.at === new Date(instant).toISOString())) instant += 1;
  return [{ at: new Date(instant).toISOString(), scene: replaced }, ...history].slice(0, HISTORY_LIMIT);
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
 * Forme de l'historique seulement ; la validité de chaque scène est celle de `validateScene`.
 * @param {unknown} raw
 * @param {(scene: unknown) => string[]} validateScene
 * @returns {string[]}
 */
export function validateHistory(raw, validateScene) {
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
    for (const error of validateScene(entry.scene)) errors.push(`${where}.scene : ${error}`);
  });
  return errors;
}
