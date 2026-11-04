// @ts-check

/**
 * dev/layers-list-keys.js — What a key does in the layers list, pure: the arrows move the selection (or the layers with Alt, or fold a group), Delete removes, F2 renames,
 * Ctrl or Cmd + D duplicates, Ctrl or Cmd + A selects all. The panel carries the action out; every action cancels the browser's own reaction to the key.
 *
 * @typedef {{ key: string, shiftKey: boolean, altKey: boolean, ctrlKey: boolean, metaKey: boolean }} KeyInput
 * @typedef {{ displayed: string[], selection: string[], lastIsGroup: boolean }} ListState `displayed`: the ids as shown, top to bottom; `selection`: the selected ids, the primary last
 * @typedef {{ type: 'move', direction: 'up' | 'down' }
 *   | { type: 'select', id: string, add: boolean }
 *   | { type: 'fold', folded: boolean }
 *   | { type: 'remove' | 'rename' | 'duplicate' | 'select-all' }
 *   | { type: 'none' }} ListKeyAction `none`: the key is the list's but there is nothing to do (the browser still must not scroll)
 */

/**
 * @param {KeyInput} input
 * @param {ListState} state
 * @returns {ListKeyAction | null} `null` when the key means nothing here (the event is left alone)
 */
export function listKeyAction(input, { displayed, selection, lastIsGroup }) {
  const { key } = input;
  const last = selection.length === 0 ? null : selection[selection.length - 1];
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const up = key === 'ArrowUp';
    if (input.altKey) return selection.length > 0 ? { type: 'move', direction: up ? 'up' : 'down' } : { type: 'none' };
    const index = last === null ? (up ? displayed.length : -1) : displayed.indexOf(last);
    const next = displayed[Math.max(0, Math.min(displayed.length - 1, index + (up ? -1 : 1)))];
    return next === undefined ? { type: 'none' } : { type: 'select', id: next, add: input.shiftKey };
  }
  if ((key === 'ArrowLeft' || key === 'ArrowRight') && last !== null && lastIsGroup) return { type: 'fold', folded: key === 'ArrowLeft' };
  if ((key === 'Delete' || key === 'Backspace') && selection.length > 0) return { type: 'remove' };
  if (key === 'F2' && last !== null) return { type: 'rename' };
  if (!(input.ctrlKey || input.metaKey)) return null;
  const letter = key.toLowerCase();
  if (letter === 'd' && selection.length > 0) return { type: 'duplicate' };
  if (letter === 'a') return { type: 'select-all' };
  return null;
}

/**
 * Undo and redo from the keyboard, anywhere in the Studio except in a text field (which keeps its own): Ctrl or Cmd + Z, Ctrl or Cmd + Shift + Z, Ctrl or Cmd + Y.
 * @param {KeyInput} input
 * @param {boolean} typing the key goes to a text field
 * @returns {'undo' | 'redo' | null}
 */
export function historyKeyAction(input, typing) {
  if (!(input.ctrlKey || input.metaKey) || typing) return null;
  const letter = input.key.toLowerCase();
  if (letter === 'z') return input.shiftKey ? 'redo' : 'undo';
  if (letter === 'y' && !input.shiftKey && !input.altKey) return 'redo';
  return null;
}
