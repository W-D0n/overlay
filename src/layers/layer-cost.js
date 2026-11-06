// @ts-check
/**
 * layer-cost.js — Le coût de dessin d'une couche : le temps que prend son `draw` à chaque image, lissé.
 *
 * C'est une mesure **relative, prise dans le navigateur qui la fait** (le Studio) : elle classe les couches entre
 * elles et montre ce qui pèse, mais OBS (CEF, GPU, résolution de la source) peut donner des valeurs différentes. Elle ne
 * remplace pas un essai dans OBS ; elle dit où regarder en premier.
 */

/** Le budget d'une image à 60 images par seconde, en millisecondes. */
export const FRAME_BUDGET_MS = 1000 / 60;
/** Poids d'un nouvel échantillon dans la moyenne glissante (0,1 : ≈ les 20 dernières images). */
export const SMOOTHING = 0.1;

/**
 * La moyenne glissante exponentielle : le premier échantillon la démarre, les suivants la déplacent.
 * @param {number | null} previous
 * @param {number} sample
 * @param {number} [alpha]
 * @returns {number}
 */
export function smooth(previous, sample, alpha = SMOOTHING) {
  if (!Number.isFinite(sample) || sample < 0) return previous ?? 0;
  return previous === null ? sample : previous + (sample - previous) * alpha;
}

/**
 * Le niveau d'un coût : part du budget d'une image à 60 i/s qu'une seule couche consomme.
 * @param {number} ms
 * @returns {'ok' | 'warn' | 'high'}
 */
export function costLevel(ms) {
  if (ms >= FRAME_BUDGET_MS * 0.3) return 'high';
  if (ms >= FRAME_BUDGET_MS * 0.1) return 'warn';
  return 'ok';
}

/** @param {number} ms @returns {string} */
export function formatCost(ms) {
  if (ms < 0.05) return '< 0,1 ms';
  return `${ms.toFixed(ms < 10 ? 1 : 0).replace('.', ',')} ms`;
}

/**
 * Le total d'une scène : somme des couches mesurées, et part du budget d'une image.
 * @param {readonly (number | null)[]} costs
 * @returns {{ total: number, share: number, level: 'ok' | 'warn' | 'high', measured: number }}
 */
export function sumCosts(costs) {
  const measured = costs.filter((cost) => cost !== null);
  const total = measured.reduce((sum, cost) => sum + /** @type {number} */ (cost), 0);
  return { total, share: total / FRAME_BUDGET_MS, level: total >= FRAME_BUDGET_MS * 0.6 ? 'high' : total >= FRAME_BUDGET_MS * 0.3 ? 'warn' : 'ok', measured: measured.length };
}
