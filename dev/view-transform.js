// @ts-check
/**
 * dev/view-transform.js — La vue de l'aperçu : échelle et position de la toile dans la zone d'affichage. Logique pure.
 *
 * Deux régimes : **ajusté** (la toile remplit la zone, recentrée à chaque redimensionnement) et **libre** (l'utilisateur a
 * zoomé ou déplacé : l'échelle et la position sont les siennes et ne bougent plus quand la fenêtre change). L'échelle est
 * absolue : 1 = un pixel de la source par pixel d'écran (« 100 % »).
 *
 * @typedef {{ areaWidth: number, areaHeight: number }} Area
 * @typedef {{ mode: 'fit' } | { mode: 'free', scale: number, left: number, top: number }} View
 * @typedef {{ scale: number, left: number, top: number }} Transform
 */
import { RENDER_REFERENCE } from '../render-reference.js';

export const STAGE_WIDTH = RENDER_REFERENCE.width;
export const STAGE_HEIGHT = RENDER_REFERENCE.height;
const STAGE_MARGIN = 16;

/**
 * Échelle et position du cadre dans la zone libre, centré. L'échelle suit la zone sans plafond :
 * sur un grand écran l'aperçu est agrandi (même composition qu'OBS, simplement plus grande).
 * @param {{ areaWidth: number, areaHeight: number }} input
 * @returns {{ scale: number, left: number, top: number }}
 */
export function fitStage({ areaWidth, areaHeight }) {
  const freeWidth = Math.max(0, areaWidth - 2 * STAGE_MARGIN);
  const freeHeight = Math.max(0, areaHeight - 2 * STAGE_MARGIN);
  const scale = Math.min(freeWidth / STAGE_WIDTH, freeHeight / STAGE_HEIGHT);
  return {
    scale,
    left: (areaWidth - STAGE_WIDTH * scale) / 2,
    top: (areaHeight - STAGE_HEIGHT * scale) / 2,
  };
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;
/** Paliers de zoom proposés (échelle absolue). */
export const ZOOM_STEPS = Object.freeze([0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8]);
/** Part de la toile qui doit toujours rester visible dans la zone, pour ne jamais « perdre » la toile hors de vue (pixels d'écran). */
const KEEP_VISIBLE_PX = 80;

/** @param {number} scale @returns {number} */
export const clampScale = (scale) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/**
 * @param {Area} area
 * @param {View} view
 * @returns {Transform}
 */
export function resolveView(area, view) {
  if (view.mode === 'fit') return fitStage(area);
  return { scale: view.scale, left: view.left, top: view.top };
}

/**
 * Garde la toile en vue : au moins `KEEP_VISIBLE_PX` de sa largeur et de sa hauteur restent dans la zone.
 * @param {Transform} transform
 * @param {Area} area
 * @returns {Transform}
 */
export function keepInView(transform, area) {
  const width = STAGE_WIDTH * transform.scale;
  const height = STAGE_HEIGHT * transform.scale;
  const keepX = Math.min(KEEP_VISIBLE_PX, width);
  const keepY = Math.min(KEEP_VISIBLE_PX, height);
  return {
    scale: transform.scale,
    left: Math.min(area.areaWidth - keepX, Math.max(keepX - width, transform.left)),
    top: Math.min(area.areaHeight - keepY, Math.max(keepY - height, transform.top)),
  };
}

/**
 * Zoome autour d'un point de la zone (le point sous le pointeur reste sous le pointeur).
 * @param {Transform} current
 * @param {number} factor
 * @param {{ x: number, y: number }} anchor point de la zone, en pixels d'écran
 * @param {Area} area
 * @returns {View}
 */
export function zoomView(current, factor, anchor, area) {
  const scale = clampScale(current.scale * factor);
  const ratio = scale / current.scale;
  const next = keepInView({ scale, left: anchor.x - (anchor.x - current.left) * ratio, top: anchor.y - (anchor.y - current.top) * ratio }, area);
  return { mode: 'free', ...next };
}

/**
 * Fixe l'échelle (palier ou « 100 % ») en gardant le centre de la zone au même endroit de la toile.
 * @param {Transform} current
 * @param {number} scale
 * @param {Area} area
 * @returns {View}
 */
export function setViewScale(current, scale, area) {
  return zoomView(current, clampScale(scale) / current.scale, { x: area.areaWidth / 2, y: area.areaHeight / 2 }, area);
}

/**
 * @param {Transform} current
 * @param {number} dx
 * @param {number} dy
 * @param {Area} area
 * @returns {View}
 */
export function panView(current, dx, dy, area) {
  return { mode: 'free', ...keepInView({ scale: current.scale, left: current.left + dx, top: current.top + dy }, area) };
}

/**
 * Le palier de zoom suivant ou précédent.
 * @param {number} scale
 * @param {1 | -1} direction
 * @returns {number}
 */
export function nextZoomStep(scale, direction) {
  const epsilon = 1e-6;
  if (direction > 0) return ZOOM_STEPS.find((step) => step > scale + epsilon) ?? MAX_SCALE;
  return [...ZOOM_STEPS].reverse().find((step) => step < scale - epsilon) ?? MIN_SCALE;
}

/**
 * Convertit un point de la zone (pixels d'écran) en pixels de la source, et inversement.
 * @param {Transform} transform
 * @param {{ x: number, y: number }} point
 */
export const screenToSource = (transform, point) => ({ x: (point.x - transform.left) / transform.scale, y: (point.y - transform.top) / transform.scale });
/** @param {Transform} transform @param {{ x: number, y: number }} point */
export const sourceToScreen = (transform, point) => ({ x: transform.left + point.x * transform.scale, y: transform.top + point.y * transform.scale });
