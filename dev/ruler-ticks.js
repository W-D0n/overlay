// @ts-check
/**
 * dev/ruler-ticks.js — Les graduations des règles de l'aperçu : quelles valeurs marquer, où les tracer. Logique pure.
 *
 * Les valeurs sont des pixels de la source (`render-reference.js`) ; la position est en pixels d'écran. Le pas s'adapte au
 * zoom pour que deux graduations étiquetées ne soient jamais plus proches qu'une étiquette n'est large.
 *
 * @typedef {{ value: number, position: number, major: boolean }} Tick
 */

/** Pas candidats, en pixels de la source. */
const STEPS = Object.freeze([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]);

/**
 * Le plus petit pas dont l'écart à l'écran laisse la place d'une étiquette.
 * @param {number} scale pixels d'écran par pixel de la source
 * @param {number} [minLabelSpacing] écart minimal entre deux graduations étiquetées, en pixels d'écran
 * @returns {number}
 */
export function pickStep(scale, minLabelSpacing = 64) {
  return STEPS.find((step) => step * scale >= minLabelSpacing) ?? STEPS[STEPS.length - 1];
}

/**
 * Les graduations visibles sur une règle de `length` pixels d'écran, dont l'origine de la source est à `offset`.
 * Les graduations principales (étiquetées) tombent tous les `pickStep` ; les secondaires, toutes les cinq fois moins, si elles
 * ne se touchent pas.
 * @param {{ scale: number, offset: number, length: number }} input
 * @returns {Tick[]}
 */
export function rulerTicks({ scale, offset, length }) {
  if (!(scale > 0) || !(length > 0)) return [];
  const step = pickStep(scale);
  const minor = step / 5;
  const useMinor = Number.isInteger(minor) && minor * scale >= 8;
  const unit = useMinor ? minor : step;
  const first = Math.floor((0 - offset) / scale / unit) * unit;
  const last = Math.ceil((length - offset) / scale / unit) * unit;
  /** @type {Tick[]} */
  const ticks = [];
  for (let value = first; value <= last; value += unit) {
    const position = offset + value * scale;
    if (position < -1 || position > length + 1) continue;
    ticks.push({ value, position, major: value % step === 0 });
  }
  return ticks;
}
