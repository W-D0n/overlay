// @ts-check
/**
 * layer-look.js — What a layer looks like at an instant, as pure functions: the animated values (timeline, then bindings), the animation laid over them, the values that go to the
 * component and the styles of the layer's calque. `scene-runtime.js` keeps the state (what is mounted, the clocks) and calls these once per frame.
 *
 * @typedef {import('./scene-doc.js').Layer} Layer
 * @typedef {Partial<Record<import('./layer-bindings.js').BindingTarget, number>>} BoundValues
 * @typedef {BoundValues & { reveal?: import('./layer-animation.js').Reveal, gone?: boolean, content?: import('./layer-animation.js').ContentState | null }} Look
 */
import { applyPose, evaluateAnimation } from './layer-animation.js';
import { animatedFilters, filterCss } from './layer-filters.js';
import { maskCss } from './layer-mask.js';
import { FILTER_TARGET_PREFIX, PARAM_TARGET_PREFIX, evaluateBindings } from './layer-bindings.js';
import { evaluateTimeline } from './layer-timeline.js';
import { CROP_SIDES } from './scene-doc.js';

/** How long a level stays the live one: a sound that stops arriving (microphone cut) is silence, not its last level. */
export const LEVELS_FRESH_SECONDS = 0.5;

/**
 * The animated values of a layer at an instant: its timeline, then its bindings (which win over the same value).
 * @param {Layer} layer
 * @param {number[]} memory the bindings' smoothing memory, kept by the caller from frame to frame
 * @param {{ timelineMs: number, levels: import('./layer-bindings.js').Levels | null, levelsAt: number, pulses: Map<string, number>, time: number, dt: number }} instant
 * @returns {BoundValues}
 */
export function valuesAt(layer, memory, { timelineMs, levels, levelsAt, pulses, time, dt }) {
  const { bindings, timeline } = layer;
  const scripted = timeline === undefined ? {} : evaluateTimeline(timeline, timelineMs);
  if (bindings === undefined || bindings.length === 0) return scripted;
  const live = time - levelsAt < LEVELS_FRESH_SECONDS ? levels : null;
  return { ...scripted, ...evaluateBindings(bindings, { levels: live, pulses, time, dt, memory }) };
}

/**
 * A layer's base values (setting, timeline, bindings) with its animation laid over them, at the instant of its own clock; a layer that has finished its exit is marked `gone`.
 * @param {Layer} layer
 * @param {number} age the layer's own clock, in milliseconds
 * @param {number | null} leftAt the age at which its scene was replaced, or `null`
 * @param {BoundValues} bound
 * @returns {Look}
 */
export function lookAt(layer, age, leftAt, bound) {
  const { animation } = layer;
  if (animation === undefined) return bound;
  const { pose, gone, content } = evaluateAnimation(animation, age, leftAt);
  return { ...bound, ...applyPose(layer, bound, pose), gone, content };
}

/**
 * The driven values of a setting (`param:<key>`), by key: they go to the component, which applies them its own way. Empty without any: the component gets its hand-set values back.
 * @param {BoundValues} values
 * @returns {Record<string, number>}
 */
export function paramValues(values) {
  /** @type {Record<string, number>} */
  const driven = {};
  for (const [target, value] of Object.entries(values)) {
    if (value !== undefined && target.startsWith(PARAM_TARGET_PREFIX)) driven[target.slice(PARAM_TARGET_PREFIX.length)] = value;
  }
  return driven;
}

/** @param {number} fraction @returns {string} */
export function percent(fraction) {
  return `${Number((fraction * 100).toFixed(4))}%`;
}

/**
 * The layer's filters with the filter values driven at this instant laid over them.
 * @param {Layer} layer
 * @param {BoundValues} bound
 */
export function drivenFilters(layer, bound) {
  /** @type {Partial<Record<import('./layer-filters.js').AdjustKey | 'glow', number>>} */
  const driven = {};
  for (const [target, value] of Object.entries(bound)) {
    if (value !== undefined && target.startsWith(FILTER_TARGET_PREFIX)) driven[/** @type {'glow'} */ (target.slice(FILTER_TARGET_PREFIX.length))] = value;
  }
  return Object.keys(driven).length === 0 ? layer.filters : animatedFilters(layer.filters, driven);
}

/**
 * L'opacité et le rendu étendu d'une couche en styles du calque. Une valeur absente donne la chaîne vide : le style inline disparaît,
 * la couche se rend comme avant. Le flou se compte en pixels de la source de référence : `--reference-scale` (posée sur
 * le conteneur) l'adapte à la hauteur réelle de la source. Les valeurs liées (`layer-bindings.js`) remplacent l'opacité, la rotation
 * et le flou de la couche, et s'ajoutent à son échelle et à son décalage ; la révélation d'une animation s'ajoute au rognage.
 * @param {Layer} layer
 * @param {Look} [bound]
 * @returns {{ display: string, opacity: string, mixBlendMode: string, transform: string, clipPath: string, filter: string, maskImage: string, maskComposite: string }}
 */
export function lookStyles(layer, bound = {}) {
  const { blend, crop } = layer;
  const { reveal } = bound;
  const revealed = reveal !== undefined && CROP_SIDES.some((side) => reveal[side] > 0);
  const rotation = bound.rotation ?? layer.rotation ?? 0;
  const blur = bound.blur ?? layer.blur ?? 0;
  const mask = maskCss(layer.mask);
  const shift = (bound.x ?? 0) !== 0 || (bound.y ?? 0) !== 0 ? `translate(${Number((bound.x ?? 0).toFixed(3))}%, ${Number((bound.y ?? 0).toFixed(3))}%)` : '';
  const turn = rotation === 0 ? '' : `rotate(${Number(rotation.toFixed(3))}deg)`;
  const grow = bound.scale === undefined || bound.scale === 1 ? '' : `scale(${Number(bound.scale.toFixed(4))})`;
  return {
    display: bound.gone === true ? 'none' : '',
    opacity: String(bound.opacity === undefined ? layer.opacity : Number(bound.opacity.toFixed(4))),
    mixBlendMode: blend === undefined || blend === 'normal' ? '' : blend,
    transform: [shift, turn, grow].filter((part) => part !== '').join(' '),
    clipPath: crop === undefined && !revealed ? '' : `inset(${CROP_SIDES.map((side) => percent(Math.min(1, (crop?.[side] ?? 0) + (reveal?.[side] ?? 0)))).join(' ')})`,
    // Les filtres de couleur et le halo d'abord, le flou ensuite : le halo est flouté avec le reste.
    // The mask comes last in the pipeline: it cuts what the filters and the blur have drawn, halo included.
    maskImage: mask.image,
    maskComposite: mask.composite,
    filter: [filterCss(drivenFilters(layer, bound)), blur === 0 ? '' : `blur(calc(var(--reference-scale, 1) * ${Number(blur.toFixed(3))}px))`].filter((part) => part !== '').join(' '),
  };
}
