// @ts-check

/**
 * layer-mask.js — The mask of a layer: a simple shape that decides which part of the layer shows. A **rectangle** or an **ellipse** (a box in fractions of the layer, with soft edges),
 * or a **linear** fade across the layer; any of them can be inverted. Pure module, no DOM: the shape and its bounds, validation, the canonical form, editing, and the CSS
 * (`mask-image`) that renders it. The runtime (`scene-runtime.js`) puts it on the layer's calque, so a mask on a group masks the whole group. Absent = no mask; a mask that
 * shows everything is not written. See docs/specs/masques-de-couche.md.
 *
 * @typedef {'rectangle' | 'ellipse' | 'linear'} MaskShape
 * @typedef {{ shape: 'rectangle' | 'ellipse', x: number, y: number, width: number, height: number, feather: number, invert?: true }} BoxMask a box in fractions of the layer, `feather` the share of each half-side that fades out
 * @typedef {{ shape: 'linear', angle: number, start: number, end: number, invert?: true }} LinearMask a fade from visible at `start` to hidden at `end` (fractions of the layer along `angle`, 0° = upward)
 * @typedef {BoxMask | LinearMask} Mask
 */

export const MASK_SHAPES = /** @type {readonly { id: MaskShape, label: string }[]} */ (Object.freeze([
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'linear', label: 'Dégradé linéaire' },
]));

export const MASK_LIMITS = Object.freeze({
  position: Object.freeze({ min: 0, max: 1, step: 0.01 }),
  size: Object.freeze({ min: 0.02, max: 1, step: 0.01 }),
  feather: Object.freeze({ min: 0, max: 1, step: 0.01 }),
  angle: Object.freeze({ min: -180, max: 180, step: 1 }),
  stop: Object.freeze({ min: 0, max: 1, step: 0.01 }),
});

/** What a shape starts from when it is chosen: a readable mask, not the whole layer. @type {Readonly<Record<MaskShape, Mask>>} */
export const DEFAULT_MASKS = Object.freeze({
  rectangle: Object.freeze({ shape: /** @type {const} */ ('rectangle'), x: 0.1, y: 0.1, width: 0.8, height: 0.8, feather: 0.1 }),
  ellipse: Object.freeze({ shape: /** @type {const} */ ('ellipse'), x: 0.1, y: 0.1, width: 0.8, height: 0.8, feather: 0.2 }),
  linear: Object.freeze({ shape: /** @type {const} */ ('linear'), angle: 90, start: 0.4, end: 0.6 }),
});

const BOX_KEYS = /** @type {const} */ (['x', 'y', 'width', 'height', 'feather']);
const LINEAR_KEYS = /** @type {const} */ (['angle', 'start', 'end']);

/** @param {unknown} value @returns {value is number} */
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
/** @param {number} value @param {number} low @param {number} high */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
/** @param {number} value */
const round = (value) => Math.round(value * 1000) / 1000;

/** @param {string} key @returns {{ min: number, max: number }} */
function limitsOf(key) {
  if (key === 'x' || key === 'y') return MASK_LIMITS.position;
  if (key === 'width' || key === 'height') return MASK_LIMITS.size;
  if (key === 'feather') return MASK_LIMITS.feather;
  if (key === 'angle') return MASK_LIMITS.angle;
  return MASK_LIMITS.stop;
}

/**
 * The defects of the mask of a layer (empty = valid).
 * @param {string} where
 * @param {unknown} mask
 * @returns {string[]}
 */
export function maskErrors(where, mask) {
  if (mask === undefined) return [];
  if (!isObject(mask)) return [`${where} : objet attendu`];
  if (!MASK_SHAPES.some(({ id }) => id === mask.shape)) return [`${where}.shape : forme de masque inconnue`];
  /** @type {string[]} */
  const errors = [];
  for (const key of mask.shape === 'linear' ? LINEAR_KEYS : BOX_KEYS) {
    if (!isNumber(mask[key])) errors.push(`${where}.${key} : nombre attendu`);
  }
  if (mask.invert !== undefined && mask.invert !== true) errors.push(`${where}.invert : vrai attendu (ou absent)`);
  return errors;
}

/**
 * The canonical form: only the fields of the shape, bounded and rounded to the thousandth, `invert` only when on; `undefined` for a mask that shows everything (a box that
 * covers the layer with hard edges, a fade that starts after its end is shown…). What is not a valid mask stays as it is: `maskErrors` refuses it.
 * @param {unknown} mask
 * @returns {unknown}
 */
export function canonicalMask(mask) {
  if (!isObject(mask) || maskErrors('mask', mask).length > 0) return mask;
  const keys = mask.shape === 'linear' ? LINEAR_KEYS : BOX_KEYS;
  /** @type {Record<string, unknown>} */
  const result = { shape: mask.shape };
  for (const key of keys) {
    const { min, max } = limitsOf(key);
    result[key] = round(clamp(/** @type {number} */ (mask[key]), min, max));
  }
  if (mask.shape === 'linear') result.end = Math.max(/** @type {number} */ (result.end), /** @type {number} */ (result.start));
  if (mask.invert === true) result.invert = true;
  return coversEverything(/** @type {Mask} */ (result)) ? undefined : result;
}

/**
 * Whether a canonical mask changes nothing: a box over the whole layer with hard edges and not inverted.
 * @param {Mask} mask
 */
function coversEverything(mask) {
  if (mask.invert === true) return false;
  if (mask.shape === 'linear') return false;
  return mask.x === 0 && mask.y === 0 && mask.width === 1 && mask.height === 1;
}

/**
 * The mask with a change applied; `null` removes it. Choosing another shape starts from that shape's default (keeping `invert`); a change of fields otherwise completes
 * what the layer already has, or the default of the shape.
 * @param {Mask | undefined} mask
 * @param {Partial<Mask> | null} change
 * @returns {Mask | undefined}
 */
export function setMask(mask, change) {
  if (change === null) return undefined;
  const shape = change.shape ?? mask?.shape ?? 'rectangle';
  const base = mask?.shape === shape ? mask : DEFAULT_MASKS[shape];
  const merged = { ...base, ...change, shape, ...(mask?.invert === true && !('invert' in change) ? { invert: true } : {}) };
  if (merged.invert !== true) delete merged.invert;
  return /** @type {Mask | undefined} */ (canonicalMask(merged));
}

/** @param {number} fraction @returns {string} */
const percent = (fraction) => `${Number((fraction * 100).toFixed(2))}%`;

/**
 * The CSS that renders a mask: the `mask-image` and how its layers combine. A rectangle is two fades (across and down) kept where both show — or, inverted, where either shows.
 * @param {Mask | undefined} mask
 * @returns {{ image: string, composite: string }} both empty when there is no mask
 */
export function maskCss(mask) {
  if (mask === undefined) return { image: '', composite: '' };
  const invert = mask.invert === true;
  const visible = invert ? 'transparent' : '#000';
  const hidden = invert ? '#000' : 'transparent';
  if (mask.shape === 'linear') {
    return { image: `linear-gradient(${mask.angle}deg, ${visible} ${percent(mask.start)}, ${hidden} ${percent(mask.end)})`, composite: '' };
  }
  const { x, y, width, height, feather } = mask;
  if (mask.shape === 'ellipse') {
    const inner = percent(1 - feather);
    return { image: `radial-gradient(ellipse ${percent(width / 2)} ${percent(height / 2)} at ${percent(x + width / 2)} ${percent(y + height / 2)}, ${visible} ${inner}, ${hidden} 100%)`, composite: '' };
  }
  /** @param {string} direction @param {number} start @param {number} size */
  const across = (direction, start, size) => {
    const soft = (feather * size) / 2;
    return `linear-gradient(${direction}, ${hidden} ${percent(start)}, ${visible} ${percent(start + soft)}, ${visible} ${percent(start + size - soft)}, ${hidden} ${percent(start + size)})`;
  };
  // Outside the box, the first and the last stops decide: hidden (or visible when inverted) before and after.
  return { image: `${across('to right', x, width)}, ${across('to bottom', y, height)}`, composite: invert ? 'add' : 'intersect' };
}
