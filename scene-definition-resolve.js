// @ts-check
/**
 * scene-definition-resolve.js — Résolution du binding déclaratif (logique pure, S8).
 *
 * Aucun effet de bord : ni DOM, ni réseau, ni temps. Consommé par `scene-runtime.js` (application
 * effective au montage + à chaque changement d'état) et testé isolément (AD-1).
 * Voir docs/specs/scene-definition-v2.md.
 */

/**
 * Une valeur est "liée" si c'est un objet portant la clé `$bind` (chaîne).
 * @param {unknown} value
 * @returns {value is import('./types.js').BoundValue}
 */
function isBoundValue(value) {
  return typeof value === 'object' && value !== null && typeof (/** @type {*} */ (value).$bind) === 'string';
}

/**
 * Lire une valeur dans un objet via un chemin en points (ex : 'sessionStats.maxViewers').
 * Ne lève jamais — un chemin absent retourne `undefined` (donnée manquante, pas une erreur, AD-1).
 * @param {Record<string, *>} obj
 * @param {string} path
 * @returns {*}
 */
function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), /** @type {*} */ (obj));
}

/**
 * Résoudre une valeur : si elle est liée (`{ $bind: path }`), retourne `state[path]` ; sinon,
 * retourne la valeur littérale telle quelle.
 * @param {unknown} value
 * @param {import('./types.js').StreamState} state
 * @returns {unknown}
 */
export function resolveBoundValue(value, state) {
  if (isBoundValue(value)) return getByPath(/** @type {*} */ (state), value.$bind);
  return value;
}

/**
 * Résoudre récursivement chaque clé d'un objet `options` (littérales ou liées).
 * @param {Record<string, unknown>} options
 * @param {import('./types.js').StreamState} state
 * @returns {Record<string, unknown>}
 */
export function resolveBoundOptions(options, state) {
  /** @type {Record<string, unknown>} */
  const resolved = {};
  for (const [key, value] of Object.entries(options)) resolved[key] = resolveBoundValue(value, state);
  return resolved;
}

/**
 * Un `ComponentMount` a-t-il au moins une option liée à l'état ? Détermine si l'instance montée
 * doit être ré-évaluée à chaque changement d'état (sinon : composant statique, jamais ré-appelé).
 * @param {Record<string, unknown>} options
 * @returns {boolean}
 */
export function hasBoundOptions(options) {
  return Object.values(options).some(isBoundValue);
}
