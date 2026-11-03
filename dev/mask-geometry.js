// @ts-check

/**
 * dev/mask-geometry.js — The arithmetic of editing a mask on the preview, pure: moving and resizing the box of a rectangle or ellipse mask, and moving the two stops of a
 * linear fade along its direction. Everything is in fractions of the frame the mask is drawn in (the layer, or the whole canvas for a group); the controller converts pointer
 * movements to fractions. The results are fields for `setMask`, which bounds and rounds them.
 *
 * @typedef {import('./canvas-geometry.js').Handle} Handle
 * @typedef {{ x: number, y: number, width: number, height: number }} Box
 */
import { MASK_LIMITS } from '../layer-mask.js';

const MIN = MASK_LIMITS.size.min;

/** @param {number} value @param {number} low @param {number} high */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * The box moved by a delta, kept inside the frame.
 * @param {Box} box
 * @param {number} dx @param {number} dy
 * @returns {{ x: number, y: number }}
 */
export function moveBox(box, dx, dy) {
  return { x: clamp(box.x + dx, 0, 1 - box.width), y: clamp(box.y + dy, 0, 1 - box.height) };
}

/**
 * The box resized by dragging one of its handles by a delta: the opposite edges stay put, the box stays inside the frame and keeps a minimal size.
 * @param {Box} box
 * @param {Handle} handle
 * @param {number} dx @param {number} dy
 * @returns {Box}
 */
export function resizeBox(box, handle, dx, dy) {
  let left = box.x;
  let top = box.y;
  let right = box.x + box.width;
  let bottom = box.y + box.height;
  if (handle.includes('w')) left = clamp(left + dx, 0, right - MIN);
  if (handle.includes('e')) right = clamp(right + dx, left + MIN, 1);
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - MIN);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + MIN, 1);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The direction of a CSS linear gradient at an angle (0° = upward, 90° = to the right) in screen coordinates, and the length of its gradient line across a frame of that size
 * (the corner-to-corner projection CSS uses).
 * @param {number} angle degrees
 * @param {number} width @param {number} height the frame, in any unit
 * @returns {{ dx: number, dy: number, length: number }}
 */
export function gradientLine(angle, width, height) {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  return { dx, dy, length: Math.abs(width * dx) + Math.abs(height * dy) };
}

/**
 * A stop of the fade moved by a pointer delta (in the same unit as the frame): the delta is projected on the gradient line. `start` cannot pass `end`, nor `end` pass `start`.
 * @param {{ angle: number, start: number, end: number }} mask
 * @param {'start' | 'end'} which
 * @param {number} dx @param {number} dy the pointer movement, in frame units
 * @param {number} width @param {number} height the frame, in the same unit
 * @returns {{ start: number, end: number }}
 */
export function moveStop(mask, which, dx, dy, width, height) {
  const line = gradientLine(mask.angle, width, height);
  if (line.length === 0) return { start: mask.start, end: mask.end };
  const moved = (dx * line.dx + dy * line.dy) / line.length;
  if (which === 'start') return { start: clamp(mask.start + moved, 0, mask.end), end: mask.end };
  return { start: mask.start, end: clamp(mask.end + moved, mask.start, 1) };
}
