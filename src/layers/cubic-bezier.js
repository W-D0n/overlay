// @ts-check

/**
 * cubic-bezier.js — La courbe de Bézier cubique d'une image clé : la même que `cubic-bezier(x1, y1, x2, y2)` en CSS, de (0, 0) à (1, 1) avec deux points de contrôle.
 * Module pur, sans DOM : la forme et ses bornes, la validation, la forme canonique, des préréglages et le calcul de la courbe. L'abscisse est le temps écoulé entre deux
 * images clés (0 à 1), l'ordonnée la part du chemin parcourue ; une ordonnée hors de 0 à 1 fait dépasser la valeur (rebond, anticipation). Voir docs/specs/timeline.md.
 *
 * @typedef {[number, number, number, number]} Bezier x1, y1, x2, y2
 */

/** Les bornes d'un point de contrôle : l'abscisse reste dans la durée (comme en CSS), l'ordonnée peut dépasser pour un rebond ou une anticipation. */
export const BEZIER_LIMITS = Object.freeze({
  x: Object.freeze({ min: 0, max: 1 }),
  y: Object.freeze({ min: -2, max: 3 }),
});

/** La courbe de départ d'une courbe personnalisée : `ease` de CSS, douce à l'arrivée. @type {Readonly<Bezier>} */
export const DEFAULT_BEZIER = Object.freeze(/** @type {Bezier} */ ([0.25, 0.1, 0.25, 1]));

export const BEZIER_PRESETS = Object.freeze(/** @type {{ id: string, label: string, bezier: Readonly<Bezier> }[]} */ ([
  { id: 'soft', label: 'Douce (comme CSS « ease »)', bezier: DEFAULT_BEZIER },
  { id: 'brake', label: 'Freine fort à l’arrivée', bezier: [0.16, 1, 0.3, 1] },
  { id: 'surge', label: 'Démarre fort, arrive doucement', bezier: [0.7, 0, 0.84, 0] },
  { id: 'overshoot', label: 'Dépasse puis se pose', bezier: [0.34, 1.56, 0.64, 1] },
  { id: 'anticipation', label: 'Recule puis part', bezier: [0.36, 0, 0.66, -0.56] },
  { id: 'swing', label: 'Recule, dépasse, se pose', bezier: [0.68, -0.55, 0.27, 1.55] },
]).map((preset) => Object.freeze(preset)));

/** @param {unknown} value @returns {value is number} */
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/** @param {unknown} value @returns {value is Bezier} quatre nombres finis (les bornes se vérifient à part) */
export function isBezier(value) {
  return Array.isArray(value) && value.length === 4 && value.every(isNumber);
}

/**
 * Les défauts d'une courbe personnalisée (vide = valide).
 * @param {string} where
 * @param {unknown} value
 * @returns {string[]}
 */
export function bezierErrors(where, value) {
  if (!isBezier(value)) return [`${where} : quatre nombres attendus (x1, y1, x2, y2)`];
  /** @type {string[]} */
  const errors = [];
  value.forEach((point, at) => {
    const limits = at % 2 === 0 ? BEZIER_LIMITS.x : BEZIER_LIMITS.y;
    if (point < limits.min || point > limits.max) errors.push(`${where}[${at}] : entre ${limits.min} et ${limits.max} attendu`);
  });
  return errors;
}

/**
 * La courbe ramenée dans ses bornes et arrondie au millième : deux courbes qui se voient pareil s'écrivent pareil.
 * @param {Bezier} value
 * @returns {Bezier}
 */
export function clampBezier(value) {
  return /** @type {Bezier} */ (value.map((point, at) => {
    const limits = at % 2 === 0 ? BEZIER_LIMITS.x : BEZIER_LIMITS.y;
    return Math.round(Math.min(limits.max, Math.max(limits.min, point)) * 1000) / 1000;
  }));
}

/**
 * La part du chemin parcourue à l'instant `x` (0 à 1) : on cherche le paramètre de la courbe dont l'abscisse vaut `x` (Newton, puis dichotomie quand il ne converge pas, par exemple à pente nulle),
 * et on en lit l'ordonnée. Aux bornes la courbe vaut 0 et 1, comme en CSS.
 * @param {Readonly<Bezier>} bezier
 * @param {number} x
 * @returns {number}
 */
export function cubicBezier([x1, y1, x2, y2], x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (/** @type {number} */ u) => ((ax * u + bx) * u + cx) * u;
  const slopeX = (/** @type {number} */ u) => (3 * ax * u + 2 * bx) * u + cx;
  let u = x;
  for (let step = 0; step < 8; step += 1) {
    const error = sampleX(u) - x;
    if (Math.abs(error) < 1e-7) return ((ay * u + by) * u + cy) * u;
    u -= error / slopeX(u);
  }
  let low = 0;
  let high = 1;
  u = x;
  for (let step = 0; step < 60; step += 1) {
    const error = sampleX(u) - x;
    if (Math.abs(error) < 1e-7) break;
    if (error > 0) high = u; else low = u;
    u = (low + high) / 2;
  }
  return ((ay * u + by) * u + cy) * u;
}
