// @ts-check
/**
 * dev/placement-math.js — Le calcul du placement des couches : unités, proportions, alignement, répartition, positions
 * prédéfinies. Logique pure, sans DOM ni scène : elle rend des placements (fractions du canvas), que l'éditeur applique.
 *
 * @typedef {import('../scene-doc.js').Placement} Placement
 * @typedef {'x' | 'y' | 'width' | 'height'} PlacementKey
 * @typedef {'percent' | 'pixel'} Unit
 * @typedef {'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'} AlignMode
 */
import { RENDER_REFERENCE } from '../render-reference.js';

/** Tolérance de comparaison de fractions : en deçà, deux placements sont le même. */
const EPSILON = 1e-6;

/** @param {PlacementKey} key @returns {number} la dimension de référence (en pixels) sur laquelle la fraction se rapporte */
function referenceSize(key) {
  return key === 'x' || key === 'width' ? RENDER_REFERENCE.width : RENDER_REFERENCE.height;
}

/**
 * Une fraction du canvas dans l'unité d'affichage : pourcentage (2 décimales) ou pixels de référence (entiers).
 * @param {PlacementKey} key
 * @param {number} fraction
 * @param {Unit} unit
 * @returns {number}
 */
export function toDisplay(key, fraction, unit) {
  return unit === 'percent' ? round(fraction * 100, 2) : Math.round(fraction * referenceSize(key));
}

/**
 * Inverse de `toDisplay` : ce que l'utilisateur a saisi, ramené en fraction du canvas.
 * @param {PlacementKey} key
 * @param {number} value
 * @param {Unit} unit
 * @returns {number}
 */
export function fromDisplay(key, value, unit) {
  return unit === 'percent' ? value / 100 : value / referenceSize(key);
}

/** @param {number} value @param {number} digits */
function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Applique la modification d'une clé à un placement. Avec `lockRatio`, changer la largeur ou la hauteur garde le
 * rapport largeur / hauteur *en pixels* (une fraction de largeur et une fraction de hauteur ne se comparent pas : le
 * canvas n'est pas carré) ; la position n'est jamais liée.
 * @param {Placement} placement
 * @param {PlacementKey} key
 * @param {number} fraction nouvelle valeur, en fraction du canvas
 * @param {{ lockRatio?: boolean }} [options]
 * @returns {Partial<Placement>} le morceau de placement à fusionner
 */
export function applyPlacementChange(placement, key, fraction, { lockRatio = false } = {}) {
  if (!lockRatio || (key !== 'width' && key !== 'height')) return { [key]: fraction };
  const pixelRatio = (placement.width * RENDER_REFERENCE.width) / (placement.height * RENDER_REFERENCE.height);
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) return { [key]: fraction };
  return key === 'width'
    ? { width: fraction, height: (fraction * RENDER_REFERENCE.width) / (pixelRatio * RENDER_REFERENCE.height) }
    : { height: fraction, width: (fraction * RENDER_REFERENCE.height * pixelRatio) / RENDER_REFERENCE.width };
}

/** @param {Placement} placement @returns {{ left: number, right: number, top: number, bottom: number }} */
function edges(placement) {
  return { left: placement.x, right: placement.x + placement.width, top: placement.y, bottom: placement.y + placement.height };
}

/**
 * La boîte englobante d'un ensemble de placements.
 * @param {readonly Placement[]} placements
 * @returns {Placement}
 */
export function boundingBox(placements) {
  const all = placements.map(edges);
  const left = Math.min(...all.map((e) => e.left));
  const top = Math.min(...all.map((e) => e.top));
  return { x: left, y: top, width: Math.max(...all.map((e) => e.right)) - left, height: Math.max(...all.map((e) => e.bottom)) - top };
}

/**
 * Aligne des couches sur un bord ou un centre de la toile, ou de leur boîte englobante. Une couche n'est jamais
 * redimensionnée ; celles qui sont déjà alignées ne figurent pas dans le résultat.
 * @param {Record<string, Placement>} layers placement de chaque couche, par identifiant
 * @param {AlignMode} mode
 * @param {'canvas' | 'selection'} reference
 * @returns {Record<string, Partial<Placement>>}
 */
export function alignPlacements(layers, mode, reference) {
  const ids = Object.keys(layers);
  if (ids.length === 0) return {};
  const frame = reference === 'canvas' ? { x: 0, y: 0, width: 1, height: 1 } : boundingBox(ids.map((id) => layers[id]));
  /** @type {Record<string, Partial<Placement>>} */
  const patches = {};
  for (const id of ids) {
    const placement = layers[id];
    /** @type {Partial<Placement>} */
    const patch = {};
    if (mode === 'left') patch.x = frame.x;
    else if (mode === 'hcenter') patch.x = frame.x + (frame.width - placement.width) / 2;
    else if (mode === 'right') patch.x = frame.x + frame.width - placement.width;
    else if (mode === 'top') patch.y = frame.y;
    else if (mode === 'vcenter') patch.y = frame.y + (frame.height - placement.height) / 2;
    else patch.y = frame.y + frame.height - placement.height;
    const key = /** @type {'x' | 'y'} */ (Object.keys(patch)[0]);
    if (Math.abs(/** @type {number} */ (patch[key]) - placement[key]) > EPSILON) patches[id] = patch;
  }
  return patches;
}

/**
 * Répartit trois couches ou plus à intervalles égaux entre la première et la dernière (selon leur position sur l'axe) :
 * les écarts *entre* couches deviennent égaux, leurs tailles ne changent pas.
 * @param {Record<string, Placement>} layers
 * @param {'horizontal' | 'vertical'} axis
 * @returns {Record<string, Partial<Placement>>} vide s'il y a moins de trois couches
 */
export function distributePlacements(layers, axis) {
  const key = axis === 'horizontal' ? 'x' : 'y';
  const size = axis === 'horizontal' ? 'width' : 'height';
  const ordered = Object.entries(layers).sort(([, a], [, b]) => a[key] - b[key]);
  if (ordered.length < 3) return {};
  const first = ordered[0][1];
  const last = ordered[ordered.length - 1][1];
  const span = last[key] + last[size] - first[key];
  const free = span - ordered.reduce((sum, [, placement]) => sum + placement[size], 0);
  const gap = free / (ordered.length - 1);
  /** @type {Record<string, Partial<Placement>>} */
  const patches = {};
  let cursor = first[key];
  for (const [id, placement] of ordered) {
    if (Math.abs(placement[key] - cursor) > EPSILON) patches[id] = { [key]: cursor };
    cursor += placement[size] + gap;
  }
  return patches;
}

/** @type {readonly { id: string, label: string, placement: Placement }[]} */
export const PLACEMENT_PRESETS = Object.freeze([
  { id: 'full', label: 'Plein cadre', placement: { x: 0, y: 0, width: 1, height: 1 } },
  { id: 'half-left', label: 'Moitié gauche', placement: { x: 0, y: 0, width: 0.5, height: 1 } },
  { id: 'half-right', label: 'Moitié droite', placement: { x: 0.5, y: 0, width: 0.5, height: 1 } },
  { id: 'half-top', label: 'Moitié haute', placement: { x: 0, y: 0, width: 1, height: 0.5 } },
  { id: 'half-bottom', label: 'Moitié basse', placement: { x: 0, y: 0.5, width: 1, height: 0.5 } },
  { id: 'third-left', label: 'Tiers gauche', placement: { x: 0, y: 0, width: 1 / 3, height: 1 } },
  { id: 'third-center', label: 'Tiers central', placement: { x: 1 / 3, y: 0, width: 1 / 3, height: 1 } },
  { id: 'third-right', label: 'Tiers droit', placement: { x: 2 / 3, y: 0, width: 1 / 3, height: 1 } },
  { id: 'corner-tl', label: 'Coin haut gauche', placement: { x: 0, y: 0, width: 0.5, height: 0.5 } },
  { id: 'corner-tr', label: 'Coin haut droit', placement: { x: 0.5, y: 0, width: 0.5, height: 0.5 } },
  { id: 'corner-bl', label: 'Coin bas gauche', placement: { x: 0, y: 0.5, width: 0.5, height: 0.5 } },
  { id: 'corner-br', label: 'Coin bas droit', placement: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 } },
  { id: 'pip-br', label: 'Incrustation bas droit', placement: { x: 0.72, y: 0.7, width: 0.25, height: 0.25 } },
  { id: 'pip-bl', label: 'Incrustation bas gauche', placement: { x: 0.03, y: 0.7, width: 0.25, height: 0.25 } },
  { id: 'center', label: 'Centré (moitié)', placement: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } },
]);

/**
 * La position prédéfinie qui correspond exactement à ce placement, ou `null`.
 * @param {Placement} placement
 * @returns {string | null}
 */
export function matchingPreset(placement) {
  const found = PLACEMENT_PRESETS.find(({ placement: candidate }) => (
    ['x', 'y', 'width', 'height'].every((key) => Math.abs(candidate[/** @type {PlacementKey} */ (key)] - placement[/** @type {PlacementKey} */ (key)]) <= EPSILON)
  ));
  return found === undefined ? null : found.id;
}
