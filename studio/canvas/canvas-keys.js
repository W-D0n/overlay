// @ts-check

/**
 * studio/canvas/canvas-keys.js — What a key does on the canvas, pure: the keyboard shortcuts of the preview (nudge, delete, duplicate, select all, clear, zoom) as an action the
 * controller carries out. `prevent` tells whether the browser's own reaction to the key (scrolling, page-wide select all…) must be cancelled.
 *
 * @typedef {{ key: string, shiftKey: boolean, ctrlKey: boolean, metaKey: boolean }} KeyInput
 * @typedef {{ type: 'nudge', dx: number, dy: number, prevent: true }
 *   | { type: 'remove' | 'duplicate' | 'select-all', prevent: true }
 *   | { type: 'clear-selection' | 'zoom-in' | 'zoom-out' | 'fit' | 'actual-size', prevent: false }} CanvasKeyAction
 */

/** Pixels an arrow key moves the selection, and with Shift. */
export const NUDGE_PX = 1;
export const NUDGE_SHIFT_PX = 10;

/**
 * @param {KeyInput} input
 * @param {boolean} hasSelection whether any layer is selected: deleting and duplicating need one
 * @returns {CanvasKeyAction | null} `null` when the key means nothing here
 */
export function canvasKeyAction({ key, shiftKey, ctrlKey, metaKey }, hasSelection) {
  const step = shiftKey ? NUDGE_SHIFT_PX : NUDGE_PX;
  switch (key) {
    case 'ArrowLeft': return { type: 'nudge', dx: -step, dy: 0, prevent: true };
    case 'ArrowRight': return { type: 'nudge', dx: step, dy: 0, prevent: true };
    case 'ArrowUp': return { type: 'nudge', dx: 0, dy: -step, prevent: true };
    case 'ArrowDown': return { type: 'nudge', dx: 0, dy: step, prevent: true };
    case 'Delete':
    case 'Backspace': return hasSelection ? { type: 'remove', prevent: true } : null;
    case 'Escape': return { type: 'clear-selection', prevent: false };
    case '+':
    case '=': return { type: 'zoom-in', prevent: false };
    case '-': return { type: 'zoom-out', prevent: false };
    case '0': return { type: 'fit', prevent: false };
    case '1': return { type: 'actual-size', prevent: false };
    default: break;
  }
  if (!(ctrlKey || metaKey)) return null;
  const letter = key.toLowerCase();
  if (letter === 'd') return hasSelection ? { type: 'duplicate', prevent: true } : null;
  if (letter === 'a') return { type: 'select-all', prevent: true };
  return null;
}
