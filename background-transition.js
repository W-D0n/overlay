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
 * Le balayage est un masque dégradé qui glisse, pas une découpe nette : un bord franc se lit comme
 * « un masque qui se déplace » sur des fonds transparents, et la dernière bande du calque sortant
 * disparaît d'un coup (retour owner, 2026-07-26). La bande de fondu adoucit les deux.
 *
 * Le masque fait deux fois la taille du calque sur l'axe concerné ; c'est sa **position** qui est
 * animée, propriété interpolable de façon fiable, contrairement aux arrêts d'un dégradé.
 */
const WIPE_AXIS = { right: 'to right', left: 'to left', up: 'to top', down: 'to bottom' };
const WIPE_MASK_SIZE = { right: '200% 100%', left: '200% 100%', up: '100% 200%', down: '100% 200%' };

/**
 * Masque de l'entrant (opaque puis transparent) et son inverse exact pour le sortant. Les deux
 * calques partagent la même position à chaque instant : c'est l'inversion du dégradé — et non un
 * dégradé miroir — qui garantit que l'un est opaque là où l'autre ne l'est pas. Vérifié en teintant
 * les deux calques : avec le dégradé miroir, le sortant n'apparaissait nulle part.
 */
const WIPE_MASK_IMAGE = (axis) => `linear-gradient(${axis}, #000 0%, #000 35%, transparent 65%, transparent 100%)`;
const WIPE_MASK_IMAGE_INVERSE = (axis) => `linear-gradient(${axis}, transparent 0%, transparent 35%, #000 65%, #000 100%)`;

/** Positions extrêmes du masque, identiques pour les deux calques. */
const WIPE_HIDDEN_POSITION = { right: '100% 0%', left: '0% 0%', up: '0% 0%', down: '0% 100%' };
const WIPE_VISIBLE_POSITION = { right: '0% 0%', left: '100% 0%', up: '0% 100%', down: '0% 0%' };

/**
 * @param {TransitionDirection} direction
 * @param {'hidden' | 'visible'} position
 * @param {boolean} inverse - `true` pour le calque sortant
 */
function wipeMask(direction, position, inverse) {
  const image = inverse
    ? WIPE_MASK_IMAGE_INVERSE(WIPE_AXIS[direction])
    : WIPE_MASK_IMAGE(WIPE_AXIS[direction]);
  const offset = position === 'hidden' ? WIPE_HIDDEN_POSITION[direction] : WIPE_VISIBLE_POSITION[direction];
  return {
    maskImage: image,
    WebkitMaskImage: image,
    maskSize: WIPE_MASK_SIZE[direction],
    WebkitMaskSize: WIPE_MASK_SIZE[direction],
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskPosition: offset,
    WebkitMaskPosition: offset,
  };
}

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
 *   incoming: { from: Record<string, string>, to: Record<string, string>, properties: string[] },
 *   outgoing: { from: Record<string, string>, to: Record<string, string>, properties: string[] },
 * }}
 */
export function transitionStyles({ type, direction }) {
  if (type === 'wipe') {
    // Même sens, même position, dégradé inversé : le sortant se retire exactement là où l'entrant
    // arrive, sans zone où les deux sont visibles ni où aucun ne l'est.
    return {
      incoming: {
        from: wipeMask(direction, 'hidden', false),
        to: wipeMask(direction, 'visible', false),
        properties: ['mask-position', '-webkit-mask-position'],
      },
      outgoing: {
        from: wipeMask(direction, 'hidden', true),
        to: wipeMask(direction, 'visible', true),
        properties: ['mask-position', '-webkit-mask-position'],
      },
    };
  }
  return {
    incoming: { from: { opacity: '0' }, to: { opacity: '1' }, properties: ['opacity'] },
    outgoing: { from: { opacity: '1' }, to: { opacity: '0' }, properties: ['opacity'] },
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
