// @ts-check
/**
 * dev/canvas-geometry.js — La géométrie de la manipulation directe : trouver une couche sous le pointeur, déplacer,
 * redimensionner (une couche ou un groupe), sélectionner au rectangle. Logique pure, sans DOM.
 *
 * Tout se calcule en **pixels de la source** (`render-reference.js`) : c'est le repère de l'utilisateur à l'écran, indépendant
 * de l'échelle d'affichage. `toPixelRect` / `fromPixelRect` font le pont avec les fractions de la scène.
 *
 * @typedef {import('../src/scene/scene-doc.js').Placement} Placement
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 * @typedef {'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'} Handle
 */
import { RENDER_REFERENCE } from '../src/render/render-reference.js';

/** Taille minimale d'une couche à la manipulation, en pixels de la source : en deçà, elle deviendrait impossible à ressaisir. */
export const MIN_SIZE_PX = 8;

/** @type {readonly Handle[]} */
export const HANDLES = Object.freeze(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);

/** Le curseur qui convient à chaque poignée. @type {Readonly<Record<Handle, string>>} */
export const HANDLE_CURSORS = Object.freeze({
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
});

/** @param {Placement} placement @returns {Rect} */
export function toPixelRect(placement) {
  return {
    x: placement.x * RENDER_REFERENCE.width,
    y: placement.y * RENDER_REFERENCE.height,
    width: placement.width * RENDER_REFERENCE.width,
    height: placement.height * RENDER_REFERENCE.height,
  };
}

/** @param {Rect} rect @returns {Placement} */
export function fromPixelRect(rect) {
  return {
    x: rect.x / RENDER_REFERENCE.width,
    y: rect.y / RENDER_REFERENCE.height,
    width: rect.width / RENDER_REFERENCE.width,
    height: rect.height / RENDER_REFERENCE.height,
  };
}

/** @param {Rect} rect @param {{ x: number, y: number }} point */
function contains(rect, point) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

/** @param {Placement} placement @returns {boolean} la couche recouvre toute la toile */
function coversCanvas({ x, y, width, height }) {
  return x <= 0.001 && y <= 0.001 && x + width >= 0.999 && y + height >= 0.999;
}

/**
 * Une couche se manipule-t-elle à la souris ? Visible, et — pour une couche d'identité — plus petite que la toile.
 * @param {{ kind: string, visible: boolean, placement: Placement }} layer
 * @param {(kind: string) => boolean} isIdentity
 * @returns {boolean}
 */
export function isSelectableOnCanvas(layer, isIdentity) {
  return layer.visible && !(isIdentity(layer.kind) && coversCanvas(layer.placement));
}

/**
 * The layers that are on screen: visible, and not in a hidden group.
 * @template {{ id: string, kind?: string, group?: string, visible: boolean }} T
 * @param {readonly T[]} layers
 * @returns {T[]}
 */
export function shownLayers(layers) {
  const hidden = new Set(layers.filter((layer) => layer.kind === 'group' && !layer.visible).map(({ id }) => id));
  return layers.filter((layer) => layer.visible && !(layer.group !== undefined && hidden.has(layer.group)));
}

/**
 * Les couches visibles sous un point (pixels de la source), de la plus haute à la plus basse. `layers` va du dessous au
 * dessus ; les couches d'identité (branding), montées au-dessus des effets, passent donc en premier — sauf quand elles
 * recouvrent toute la toile : elles voleraient alors chaque clic alors qu'il n'y a rien à y déplacer, on ne les vise que
 * par le panneau de couches. Une couche masquée est transparente au pointeur, ainsi que celles d'un groupe masqué.
 * A group is reached where one of its members is, not over the empty part of its box: it comes before its members (it is above them), so a click selects the group
 * and Alt+click goes down into its members.
 * @param {readonly { id: string, kind: string, group?: string, visible: boolean, placement: Placement }[]} layers
 * @param {{ x: number, y: number }} point
 * @param {(kind: string) => boolean} isIdentity
 * @returns {string[]}
 */
export function hitTestAll(layers, point, isIdentity) {
  const shown = shownLayers(layers);
  const ordered = [...shown.filter(({ kind }) => isIdentity(kind)).reverse(), ...shown.filter(({ kind }) => !isIdentity(kind)).reverse()];
  return ordered
    .filter((layer) => isSelectableOnCanvas(layer, isIdentity) && reaches(shown, layer, (rect) => contains(rect, point)))
    .map(({ id }) => id);
}

/**
 * Whether a layer is reached by a test on rectangles: its own rectangle, or for a group the rectangle of any of its members.
 * @param {readonly { id: string, kind?: string, group?: string, placement: Placement }[]} shown
 * @param {{ id: string, kind?: string, placement: Placement }} layer
 * @param {(rect: Rect) => boolean} test
 */
function reaches(shown, layer, test) {
  if (layer.kind !== 'group') return test(toPixelRect(layer.placement));
  return shown.some((member) => member.group === layer.id && test(toPixelRect(member.placement)));
}

/**
 * La couche la plus haute sous le point, ou `null`.
 * @param {readonly { id: string, kind: string, visible: boolean, placement: Placement }[]} layers
 * @param {{ x: number, y: number }} point
 * @param {(kind: string) => boolean} isIdentity
 * @returns {string | null}
 */
export function hitTest(layers, point, isIdentity) {
  return hitTestAll(layers, point, isIdentity)[0] ?? null;
}

/**
 * Les couches visibles dont le rectangle touche le rectangle de sélection. A group is taken instead of its members: it is touched when one of them is.
 * @param {readonly { id: string, kind?: string, group?: string, visible: boolean, placement: Placement }[]} layers
 * @param {Rect} marquee
 * @returns {string[]}
 */
export function marqueeHits(layers, marquee) {
  const shown = shownLayers(layers);
  const touches = (/** @type {Rect} */ rect) => rect.x < marquee.x + marquee.width && rect.x + rect.width > marquee.x && rect.y < marquee.y + marquee.height && rect.y + rect.height > marquee.y;
  return shown.filter((layer) => layer.group === undefined && reaches(shown, layer, touches)).map(({ id }) => id);
}

/**
 * Le rectangle normalisé (largeur et hauteur positives) entre deux points.
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 * @returns {Rect}
 */
export function rectBetween(from, to) {
  return { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), width: Math.abs(to.x - from.x), height: Math.abs(to.y - from.y) };
}

/** @param {readonly Rect[]} rects @returns {Rect} */
export function unionRect(rects) {
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  return { x: left, y: top, width: Math.max(...rects.map((r) => r.x + r.width)) - left, height: Math.max(...rects.map((r) => r.y + r.height)) - top };
}

/**
 * @param {Rect} start
 * @param {number} dx
 * @param {number} dy
 * @param {{ lockAxis?: boolean }} [options] `lockAxis` : le déplacement suit l'axe dominant seulement (Maj)
 * @returns {Rect}
 */
export function moveRect(start, dx, dy, { lockAxis = false } = {}) {
  if (lockAxis) {
    if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
    else dx = 0;
  }
  return { ...start, x: start.x + dx, y: start.y + dy };
}

/**
 * Redimensionne un rectangle par une poignée. Les bords opposés (ou le centre avec `fromCenter`) restent fixes ; la taille
 * ne descend jamais sous `MIN_SIZE_PX` et ne se retourne pas. Avec `keepRatio`, le rapport du départ est conservé : une
 * poignée d'angle suit le mouvement dominant, une poignée de bord fait varier l'autre dimension autour de son centre.
 * @param {Rect} start
 * @param {Handle} handle
 * @param {number} dx déplacement du pointeur depuis le départ
 * @param {number} dy
 * @param {{ keepRatio?: boolean, fromCenter?: boolean, minSize?: number }} [options]
 * @returns {Rect}
 */
export function resizeRect(start, handle, dx, dy, { keepRatio = false, fromCenter = false, minSize = MIN_SIZE_PX } = {}) {
  const factor = fromCenter ? 2 : 1;
  let width = start.width + (handle.includes('e') ? dx : handle.includes('w') ? -dx : 0) * factor;
  let height = start.height + (handle.includes('s') ? dy : handle.includes('n') ? -dy : 0) * factor;
  width = Math.max(minSize, width);
  height = Math.max(minSize, height);
  if (keepRatio && start.width > 0 && start.height > 0) ({ width, height } = lockRatio(start, handle, width, height, minSize));
  return { ...anchoredOrigin(start, handle, width, height, { keepRatio, fromCenter }), width, height };
}

/**
 * Brings a size back to the starting ratio: a corner handle follows the dimension that moved most (relative to its starting size), an edge handle
 * drives the other dimension; the minimum size wins over the ratio's other side.
 * @param {Rect} start @param {Handle} handle @param {number} width @param {number} height @param {number} minSize
 * @returns {{ width: number, height: number }}
 */
function lockRatio(start, handle, width, height, minSize) {
  const ratio = start.width / start.height;
  const horizontal = handle.includes('e') || handle.includes('w');
  const vertical = handle.includes('n') || handle.includes('s');
  if (horizontal && vertical) {
    const widthChange = Math.abs(width - start.width) / start.width;
    const heightChange = Math.abs(height - start.height) / start.height;
    if (widthChange >= heightChange) height = width / ratio;
    else width = height * ratio;
  } else if (horizontal) {
    height = width / ratio;
  } else {
    width = height * ratio;
  }
  if (width < minSize) { width = minSize; height = width / ratio; }
  if (height < minSize) { height = minSize; width = height * ratio; }
  return { width, height };
}

/**
 * Where the top-left corner goes once the size is known: around the centre with `fromCenter`, else the edge opposite to the handle stays put.
 * An edge handle with a locked ratio recentres the other dimension on its starting middle.
 * @param {Rect} start @param {Handle} handle @param {number} width @param {number} height @param {{ keepRatio: boolean, fromCenter: boolean }} mode
 * @returns {{ x: number, y: number }}
 */
function anchoredOrigin(start, handle, width, height, { keepRatio, fromCenter }) {
  if (fromCenter) return { x: start.x + (start.width - width) / 2, y: start.y + (start.height - height) / 2 };
  let x = handle.includes('w') ? start.x + start.width - width : start.x;
  let y = handle.includes('n') ? start.y + start.height - height : start.y;
  if (keepRatio && handle.length !== 2) {
    if (handle === 'n' || handle === 's') x = start.x + (start.width - width) / 2;
    if (handle === 'e' || handle === 'w') y = start.y + (start.height - height) / 2;
  }
  return { x, y };
}

/**
 * Applique à des rectangles la transformation qui fait passer `fromBox` à `toBox` : leur position et leur taille suivent
 * proportionnellement. C'est le redimensionnement d'un groupe sélectionné par sa boîte englobante.
 * @param {Rect} fromBox
 * @param {Rect} toBox
 * @param {Record<string, Rect>} rects
 * @returns {Record<string, Rect>}
 */
export function scaleRectsWithin(fromBox, toBox, rects) {
  const sx = fromBox.width === 0 ? 1 : toBox.width / fromBox.width;
  const sy = fromBox.height === 0 ? 1 : toBox.height / fromBox.height;
  return Object.fromEntries(Object.entries(rects).map(([id, rect]) => [id, {
    x: toBox.x + (rect.x - fromBox.x) * sx,
    y: toBox.y + (rect.y - fromBox.y) * sy,
    width: rect.width * sx,
    height: rect.height * sy,
  }]));
}

/**
 * Les huit poignées d'une boîte : leur centre, en pixels de la source.
 * @param {Rect} box
 * @returns {Record<Handle, { x: number, y: number }>}
 */
export function handlePoints(box) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  return { nw: { x: box.x, y: box.y }, n: { x: cx, y: box.y }, ne: { x: right, y: box.y }, e: { x: right, y: cy }, se: { x: right, y: bottom }, s: { x: cx, y: bottom }, sw: { x: box.x, y: bottom }, w: { x: box.x, y: cy } };
}
