// @ts-check

/**
 * dev/code-editing.js — The small conveniences of a code text area, as pure functions on a text and a selection: Tab and Shift+Tab indent and outdent, Enter keeps the
 * indentation (and opens a block after a bracket). Each returns the text span to replace and the selection to set after, so the controller can apply it as one edit (and keep
 * the browser's own undo). Indentation is two spaces, as the Studio's code fields show tabs two columns wide.
 *
 * @typedef {{ from: number, to: number, insert: string, start: number, end: number }} Edit replace `text.slice(from, to)` by `insert`, then select `start..end` (positions in the new text)
 */

export const INDENT = '  ';
const CLOSERS = /** @type {Record<string, string>} */ ({ '{': '}', '[': ']', '(': ')' });

/** @param {string} text @param {number} position @returns {number} the start of the line holding `position` */
const lineStart = (text, position) => text.lastIndexOf('\n', position - 1) + 1;
/** @param {string} text @param {number} position @returns {number} the end of the line holding `position` (before its newline) */
const lineEnd = (text, position) => {
  const next = text.indexOf('\n', position);
  return next === -1 ? text.length : next;
};

/**
 * Tab: with nothing selected (or a selection inside one line) inserts the indentation at the caret; with several lines touched indents each of them.
 * @param {string} text @param {number} start @param {number} end the selection
 * @returns {Edit}
 */
export function indent(text, start, end) {
  const touchesSeveralLines = text.slice(start, end).includes('\n');
  if (!touchesSeveralLines) return { from: start, to: end, insert: INDENT, start: start + INDENT.length, end: start + INDENT.length };
  const from = lineStart(text, start);
  // A selection that ends at the very start of a line does not touch that line.
  const last = end > start && text[end - 1] === '\n' ? end - 1 : end;
  const to = lineEnd(text, last);
  const lines = text.slice(from, to).split('\n');
  const insert = lines.map((line) => (line === '' ? line : INDENT + line)).join('\n');
  const firstGrows = lines[0] === '' ? 0 : INDENT.length;
  return { from, to, insert, start: start + firstGrows, end: end + insert.length - (to - from) };
}

/**
 * Shift+Tab: takes one indentation (or fewer spaces, or a tab) off the start of each line the selection touches — the current line for a caret.
 * @param {string} text @param {number} start @param {number} end the selection
 * @returns {Edit | null} `null` when no touched line is indented
 */
export function outdent(text, start, end) {
  const from = lineStart(text, start);
  const last = end > start && text[end - 1] === '\n' ? end - 1 : end;
  const to = lineEnd(text, last);
  const lines = text.slice(from, to).split('\n');
  const removed = lines.map((line) => {
    if (line.startsWith('\t')) return 1;
    let count = 0;
    while (count < INDENT.length && line[count] === ' ') count += 1;
    return count;
  });
  if (removed.every((count) => count === 0)) return null;
  const insert = lines.map((line, index) => line.slice(removed[index])).join('\n');
  const newStart = Math.max(from, start - removed[0]);
  const newEnd = Math.max(newStart, end - removed.reduce((sum, count) => sum + count, 0));
  return { from, to, insert, start: newStart, end: newEnd };
}

/**
 * Enter: a new line that starts with the indentation of the current one. After an opening bracket, one level deeper; between a bracket and its closer, the closer goes to its own line.
 * @param {string} text @param {number} start @param {number} end the selection
 * @returns {Edit}
 */
export function newline(text, start, end) {
  const begin = lineStart(text, start);
  const margin = /^[ \t]*/.exec(text.slice(begin, start))?.[0] ?? '';
  const before = text.slice(0, start).trimEnd().slice(-1);
  const after = text[end] ?? '';
  const opens = before !== '' && before in CLOSERS && text.slice(0, start).endsWith(before);
  if (opens && after === CLOSERS[before]) {
    const inner = `\n${margin}${INDENT}`;
    return { from: start, to: end, insert: `${inner}\n${margin}`, start: start + inner.length, end: start + inner.length };
  }
  const insert = `\n${margin}${opens ? INDENT : ''}`;
  return { from: start, to: end, insert, start: start + insert.length, end: start + insert.length };
}

/**
 * The number of lines of a text (at least one).
 * @param {string} text
 */
export function lineCount(text) {
  return text.split('\n').length;
}

/**
 * Applies an edit to a text, for the tests and for any caller without a text area.
 * @param {string} text @param {Edit} edit
 * @returns {{ text: string, start: number, end: number }}
 */
export function applyEdit(text, edit) {
  return { text: text.slice(0, edit.from) + edit.insert + text.slice(edit.to), start: edit.start, end: edit.end };
}
