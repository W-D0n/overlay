// @ts-check
/**
 * background-transition.js — Comment un preset entrant remplace le fond courant.
 *
 * Logique pure : ni DOM, ni temps, ni animation ici. `background-mount.js` applique ces styles.
 * Voir docs/specs/background-preset-transitions.md.
 *
 * @typedef {'fade' | 'wipe'} TransitionType
 * @typedef {'left' | 'right' | 'up' | 'down'} TransitionDirection
 * @typedef {'linear' | 'easeIn' | 'easeOut' | 'easeInOut'} TransitionEasing
 * @typedef {{ type: TransitionType, durationMs: number, direction: TransitionDirection, easing: TransitionEasing }} BackgroundTransition
 */

/** Bornée : une transition ne doit jamais immobiliser un fond en direct. */
export const MAX_TRANSITION_DURATION_MS = 2000;

/** @type {BackgroundTransition} */
export const DEFAULT_TRANSITION = Object.freeze({
  type: 'fade',
  durationMs: 600,
  direction: 'right',
  easing: 'easeInOut',
});

const TYPES = ['fade', 'wipe'];
const DIRECTIONS = ['left', 'right', 'up', 'down'];
const EASINGS = ['linear', 'easeIn', 'easeOut', 'easeInOut'];

/** Courbes CSS correspondantes — le vocabulaire du tuner reste indépendant de la syntaxe CSS. */
const CSS_EASING = {
  linear: 'linear',
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
};

/** @param {TransitionEasing} easing */
export function cssEasing(easing) {
  return CSS_EASING[easing] ?? CSS_EASING[DEFAULT_TRANSITION.easing];
}

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

/**
 * Masquage symétrique du calque sortant. Indispensable : les effets peignent sur des canvas
 * transparents, donc révéler l'entrant ne cache pas le sortant — sans ce masquage, les deux
 * restent visibles puis le sortant disparaît d'un coup (retour owner, 2026-07-26).
 */
const WIPE_OUTGOING_END_CLIP = {
  right: 'inset(0 100% 0 0)',
  left: 'inset(0 0 0 100%)',
  up: 'inset(0 0 100% 0)',
  down: 'inset(100% 0 0 0)',
};

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
  const easing = EASINGS.includes(/** @type {*} */ (value.easing))
    ? /** @type {TransitionEasing} */ (value.easing)
    : DEFAULT_TRANSITION.easing;
  const durationMs = typeof value.durationMs === 'number' && Number.isFinite(value.durationMs)
    ? Math.min(MAX_TRANSITION_DURATION_MS, Math.max(0, value.durationMs))
    : DEFAULT_TRANSITION.durationMs;

  return { type, durationMs, direction, easing };
}

/**
 * Styles de départ et d'arrivée des deux calques. Les deux sont animés : sur des canvas
 * transparents, faire apparaître l'entrant ne suffit pas à faire disparaître le sortant.
 * @param {{ type: TransitionType, direction: TransitionDirection }} transition
 * @returns {{
 *   incoming: { from: Record<string, string>, to: Record<string, string>, property: string },
 *   outgoing: { from: Record<string, string>, to: Record<string, string>, property: string },
 * }}
 */
export function transitionStyles({ type, direction }) {
  if (type === 'wipe') {
    return {
      incoming: {
        from: { clipPath: WIPE_START_CLIP[direction] },
        to: { clipPath: WIPE_END_CLIP },
        property: 'clip-path',
      },
      outgoing: {
        from: { clipPath: WIPE_END_CLIP },
        to: { clipPath: WIPE_OUTGOING_END_CLIP[direction] },
        property: 'clip-path',
      },
    };
  }
  return {
    incoming: { from: { opacity: '0' }, to: { opacity: '1' }, property: 'opacity' },
    outgoing: { from: { opacity: '1' }, to: { opacity: '0' }, property: 'opacity' },
  };
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
  if (value.easing !== undefined && !EASINGS.includes(/** @type {*} */ (value.easing))) {
    errors.push(`transition.easing : ${EASINGS.join(', ')} attendu`);
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
