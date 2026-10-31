// @ts-check
import { BINDING_TARGETS } from '../layer-bindings.js';
import { effectiveTimeline, sampleKeys } from '../layer-timeline.js';

/**
 * dev/timeline-view.js — Ce que le panneau de la timeline calcule pour s'afficher : temps lisible, position d'une image clé, instant sous le pointeur,
 * valeur d'une piste au repère de lecture. Pur : testable sans navigateur.
 */

/** @param {number} ms @returns {string} « 1,25 s » */
export function formatSeconds(ms) {
  return `${(Math.round(ms) / 1000).toFixed(2).replace('.', ',')} s`;
}

/**
 * La position d'un instant sur une piste, en pourcentage de sa largeur (borné : une clé reste visible même au bout).
 * @param {number} t @param {number} durationMs @returns {number}
 */
export function percentOf(t, durationMs) {
  return durationMs <= 0 ? 0 : Math.min(100, Math.max(0, (t / durationMs) * 100));
}

/**
 * L'instant désigné par un pointeur sur une piste, arrondi à `snapMs` (10 ms) et borné à la durée.
 * @param {number} pointerX @param {{ left: number, width: number }} lane @param {number} durationMs @param {number} [snapMs]
 * @returns {number}
 */
export function timeFromPointer(pointerX, lane, durationMs, snapMs = 10) {
  if (lane.width <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, (pointerX - lane.left) / lane.width));
  return Math.min(durationMs, Math.round((ratio * durationMs) / snapMs) * snapMs);
}

/** La valeur de base d'une valeur animée : celle de la couche quand rien ne l'anime (opacité et rotation de la couche, 1 pour l'échelle, 0 sinon). */
const BASES = /** @type {const} */ ({
  opacity: (/** @type {import('../scene-doc.js').Layer} */ layer) => layer.opacity,
  rotation: (/** @type {import('../scene-doc.js').Layer} */ layer) => layer.rotation ?? 0,
  blur: (/** @type {import('../scene-doc.js').Layer} */ layer) => layer.blur ?? 0,
  scale: () => 1,
  x: () => 0,
  y: () => 0,
});

/**
 * La valeur d'une couche pour une valeur animée au repère de lecture : celle de sa piste si elle en a une, sinon sa valeur de base. C'est ce qu'une
 * image clé posée à cet endroit doit prendre pour ne rien changer d'abord.
 * @param {import('../scene-doc.js').Layer} layer
 * @param {import('../layer-bindings.js').BindingTarget} target
 * @param {number} timeMs
 * @returns {number}
 */
export function valueAt(layer, target, timeMs) {
  const track = layer.timeline?.find((candidate) => candidate.target === target);
  const sampled = track === undefined ? null : sampleKeys(track.keys, timeMs);
  return sampled ?? BASES[target](layer);
}

/**
 * La phrase lue par un lecteur d'écran pour une image clé.
 * @param {import('../layer-bindings.js').BindingTarget} target
 * @param {import('../layer-timeline.js').Keyframe} key
 * @returns {string}
 */
export function describeKey(target, key) {
  const range = BINDING_TARGETS[target];
  return `Image clé ${range.label.toLowerCase()} à ${formatSeconds(key.t)}, valeur ${key.v}${range.unit === '' ? '' : ` ${range.unit}`}`;
}

/**
 * La durée affichée d'une scène : la sienne, ou celle par défaut.
 * @param {import('../scene-doc.js').SceneDoc} scene
 * @returns {import('../layer-timeline.js').SceneTimeline}
 */
export function timelineOf(scene) {
  return effectiveTimeline(scene.timeline, scene.layers);
}
