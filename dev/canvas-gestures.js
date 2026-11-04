// @ts-check
/**
 * dev/canvas-gestures.js — What a gesture on the canvas does, as pure functions: the new rectangles of a drag (move or resize, with snapping), the layer a click aims at and how it
 * changes the selection, the cursor over the canvas. `canvas-overlay-controller.js` reads the pointer, calls these and carries the result out as editor commands.
 *
 * @typedef {import('./canvas-geometry.js').Rect} Rect
 * @typedef {import('./canvas-geometry.js').Handle} Handle
 * @typedef {import('./canvas-snapping.js').Guide} Guide
 * @typedef {{ targets: () => ReturnType<typeof import('./canvas-snapping.js').collectTargets>, threshold: number }} Snapping `targets` is asked only when snapping is really applied
 */
import { HANDLE_CURSORS, moveRect, resizeRect, scaleRectsWithin } from './canvas-geometry.js';
import { snapMove, snapResize } from './canvas-snapping.js';

/**
 * The rectangles after a drag: every moved layer follows the same shift (a move) or is scaled with the box (a resize).
 * Move: Shift locks one axis. Resize: Shift keeps the proportions, Alt resizes from the center; snapping applies to a move, and to a resize that keeps neither.
 * @param {{ type: 'move' | 'resize', startBox: Rect, startRects: Record<string, Rect>, handle?: Handle | null }} gesture
 * @param {{ dx: number, dy: number }} delta the pointer's shift from where the gesture began, in source pixels
 * @param {{ shiftKey: boolean, altKey: boolean }} keys
 * @param {Snapping | null} snapping `null`: snapping is off (disabled, or Ctrl or Cmd held)
 * @returns {{ rects: Record<string, Rect>, guides: Guide[], readout: string, label: string }}
 */
export function dragResult(gesture, { dx, dy }, { shiftKey, altKey }, snapping) {
  const { startBox, startRects } = gesture;
  if (gesture.type === 'move') {
    const box = moveRect(startBox, dx, dy, { lockAxis: shiftKey });
    const snapped = snapping === null ? { dx: 0, dy: 0, guides: [] } : snapMove(box, snapping.targets(), snapping.threshold);
    const ddx = box.x + snapped.dx - startBox.x;
    const ddy = box.y + snapped.dy - startBox.y;
    const rects = Object.fromEntries(Object.entries(startRects).map(([id, rect]) => [id, { ...rect, x: rect.x + ddx, y: rect.y + ddy }]));
    return { rects, guides: snapped.guides, readout: `X ${Math.round(box.x + snapped.dx)} · Y ${Math.round(box.y + snapped.dy)}`, label: 'Déplacer' };
  }
  const handle = /** @type {Handle} */ (gesture.handle);
  let box = resizeRect(startBox, handle, dx, dy, { keepRatio: shiftKey, fromCenter: altKey });
  /** @type {Guide[]} */
  let guides = [];
  if (snapping !== null && !shiftKey && !altKey) {
    const snapped = snapResize(box, handle, snapping.targets(), snapping.threshold);
    box = snapped.box;
    guides = snapped.guides;
  }
  return { rects: scaleRectsWithin(startBox, box, startRects), guides, readout: `${Math.round(box.width)} × ${Math.round(box.height)} px`, label: 'Redimensionner' };
}

/**
 * Which layer a click on the canvas aims at, and what it does to the selection. Alt picks the layer just below the selected one at that spot; Shift toggles the layer in the
 * selection; a plain click selects it unless it already is selected (then it stays, so that dragging moves the whole selection).
 * @param {{ hits: string[], selection: readonly string[], altKey: boolean, shiftKey: boolean }} input `hits`: the layers under the pointer, top first
 * @returns {{ hit: string | null, select: { ids: string[], mode: 'replace' | 'toggle' } | null }}
 */
export function pickOnDown({ hits, selection, altKey, shiftKey }) {
  let hit = hits[0] ?? null;
  if (altKey && hits.length > 0) {
    const current = hits.findIndex((id) => selection.includes(id));
    hit = hits[current < 0 ? 0 : Math.min(hits.length - 1, current + 1)];
  }
  if (hit === null) return { hit, select: null };
  if (shiftKey) return { hit, select: { ids: [hit], mode: 'toggle' } };
  if (!selection.includes(hit) || altKey) return { hit, select: { ids: [hit], mode: 'replace' } };
  return { hit, select: null };
}

/**
 * The cursor over the canvas: the hand while Space is held, the handle's arrow over a handle, the move cross over a selected layer that can move, the arrow elsewhere.
 * @param {{ spaceDown: boolean, handle: Handle | null, overMovable: boolean }} input
 * @returns {string}
 */
export function cursorFor({ spaceDown, handle, overMovable }) {
  if (spaceDown) return 'grab';
  if (handle !== null) return HANDLE_CURSORS[handle];
  return overMovable ? 'move' : 'default';
}
