// @ts-check
/**
 * background-transition.js — Comment un preset entrant remplace le fond courant.
 *
 * Logique pure : ni DOM, ni temps, ni animation ici. `background-mount.js` applique ces styles.
 * Voir docs/specs/background-preset-transitions.md.
 *
 * @typedef {'fade' | 'wipe'} TransitionType
 * @typedef {'left' | 'right' | 'up' | 'down'} TransitionDirection
 * @typedef {{ type: TransitionType, durationMs: number, direction: TransitionDirection }} BackgroundTransition
 */

/** Bornée : une transition ne doit jamais immobiliser un fond en direct. */
export const MAX_TRANSITION_DURATION_MS = 2000;

/** @type {BackgroundTransition} */
export const DEFAULT_TRANSITION = Object.freeze({ type: 'fade', durationMs: 600, direction: 'right' });

const TYPES = ['fade', 'wipe'];
const DIRECTIONS = ['left', 'right', 'up', 'down'];

/**
 * Côté par lequel le calque entrant est masqué au départ — opposé au sens de progression.
 * `inset(haut droite bas gauche)`.
 */
const WIPE_START_CLIP = {
  right: 'inset(0 0 0 100%)',
  left: 'inset(0 100% 0 0)',
  up: 'inset(100% 0 0 0)',
  down: 'inset(0 0 100% 0)',
};

const WIPE_END_CLIP = 'inset(0 0 0 0)';

/** @param {unknown} value */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Ramène n'importe quelle entrée à une transition jouable. Utilisée au rendu : un état écrit par
 * une version plus ancienne ou plus récente ne doit jamais casser un live.
 * @param {unknown} value
 * @returns {BackgroundTransition}
 */
export function normalizeTransition(value) {
  if (!isPlainObject(value)) return { ...DEFAULT_TRANSITION };

  const type = TYPES.includes(/** @type {*} */ (value.type))
    ? /** @type {TransitionType} */ (value.type)
    : DEFAULT_TRANSITION.type;
  const direction = DIRECTIONS.includes(/** @type {*} */ (value.direction))
    ? /** @type {TransitionDirection} */ (value.direction)
    : DEFAULT_TRANSITION.direction;
  const durationMs = typeof value.durationMs === 'number' && Number.isFinite(value.durationMs)
    ? Math.min(MAX_TRANSITION_DURATION_MS, Math.max(0, value.durationMs))
    : DEFAULT_TRANSITION.durationMs;

  return { type, durationMs, direction };
}

/**
 * Styles de départ et d'arrivée du calque entrant. L'ancien calque n'est jamais touché : il reste
 * intact dessous jusqu'à son démontage, ce qui évite un clignotement à mi-parcours.
 * @param {{ type: TransitionType, direction: TransitionDirection }} transition
 * @returns {{ from: Record<string, string>, to: Record<string, string> }}
 */
export function transitionStyles({ type, direction }) {
  if (type === 'wipe') {
    return { from: { clipPath: WIPE_START_CLIP[direction] }, to: { clipPath: WIPE_END_CLIP } };
  }
  return { from: { opacity: '0' }, to: { opacity: '1' } };
}

/**
 * Valide une transition avant écriture. Contrairement à `normalizeTransition`, refuse au lieu de
 * corriger : une valeur fautive enregistrée est une erreur à signaler, pas à absorber.
 * @param {unknown} value
 * @returns {import('./types.js').ValidationResult}
 */
export function validateTransition(value) {
  if (value === undefined) return { ok: true, errors: [] };
  if (!isPlainObject(value)) return { ok: false, errors: ['transition : objet attendu'] };

  /** @type {string[]} */
  const errors = [];
  if (value.type !== undefined && !TYPES.includes(/** @type {*} */ (value.type))) {
    errors.push(`transition.type : ${TYPES.join(' ou ')} attendu`);
  }
  if (value.direction !== undefined && !DIRECTIONS.includes(/** @type {*} */ (value.direction))) {
    errors.push(`transition.direction : ${DIRECTIONS.join(', ')} attendu`);
  }
  if (value.durationMs !== undefined) {
    const duration = value.durationMs;
    const valid = typeof duration === 'number'
      && Number.isFinite(duration)
      && duration >= 0
      && duration <= MAX_TRANSITION_DURATION_MS;
    if (!valid) errors.push(`transition.durationMs : nombre entre 0 et ${MAX_TRANSITION_DURATION_MS} attendu`);
  }

  return { ok: errors.length === 0, errors };
}
