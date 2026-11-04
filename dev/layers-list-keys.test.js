import { describe, expect, test } from 'bun:test';
import { historyKeyAction, listKeyAction } from './layers-list-keys.js';

const key = (name, over = {}) => ({ key: name, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...over });
const state = (over = {}) => ({ displayed: ['a', 'b', 'c'], selection: ['b'], lastIsGroup: false, ...over });

describe('listKeyAction', () => {
  test('the arrows select the neighbour, stopping at the ends, and Shift adds it', () => {
    expect(listKeyAction(key('ArrowDown'), state())).toEqual({ type: 'select', id: 'c', add: false });
    expect(listKeyAction(key('ArrowUp'), state())).toEqual({ type: 'select', id: 'a', add: false });
    expect(listKeyAction(key('ArrowDown', { shiftKey: true }), state())).toEqual({ type: 'select', id: 'c', add: true });
    expect(listKeyAction(key('ArrowDown'), state({ selection: ['c'] }))).toEqual({ type: 'select', id: 'c', add: false });
    expect(listKeyAction(key('ArrowUp'), state({ selection: ['a'] }))).toEqual({ type: 'select', id: 'a', add: false });
  });

  test('the neighbour is taken from the last selected one', () => {
    expect(listKeyAction(key('ArrowDown'), state({ selection: ['c', 'a'] }))).toEqual({ type: 'select', id: 'b', add: false });
  });

  test('with nothing selected, Down picks the first and Up the last', () => {
    expect(listKeyAction(key('ArrowDown'), state({ selection: [] }))).toEqual({ type: 'select', id: 'a', add: false });
    expect(listKeyAction(key('ArrowUp'), state({ selection: [] }))).toEqual({ type: 'select', id: 'c', add: false });
  });

  test('with an empty list the arrows do nothing, yet are the list\'s', () => {
    expect(listKeyAction(key('ArrowDown'), state({ displayed: [], selection: [] }))).toEqual({ type: 'none' });
  });

  test('Alt + arrow moves the selected layers, and does nothing without a selection', () => {
    expect(listKeyAction(key('ArrowUp', { altKey: true }), state())).toEqual({ type: 'move', direction: 'up' });
    expect(listKeyAction(key('ArrowDown', { altKey: true }), state())).toEqual({ type: 'move', direction: 'down' });
    expect(listKeyAction(key('ArrowDown', { altKey: true }), state({ selection: [] }))).toEqual({ type: 'none' });
  });

  test('Left folds and Right unfolds a group, and nothing else', () => {
    expect(listKeyAction(key('ArrowLeft'), state({ lastIsGroup: true }))).toEqual({ type: 'fold', folded: true });
    expect(listKeyAction(key('ArrowRight'), state({ lastIsGroup: true }))).toEqual({ type: 'fold', folded: false });
    expect(listKeyAction(key('ArrowLeft'), state())).toBeNull();
    expect(listKeyAction(key('ArrowLeft'), state({ lastIsGroup: true, selection: [] }))).toBeNull();
  });

  test('Delete and Backspace remove, F2 renames, each needing a selection', () => {
    for (const name of ['Delete', 'Backspace']) {
      expect(listKeyAction(key(name), state())).toEqual({ type: 'remove' });
      expect(listKeyAction(key(name), state({ selection: [] }))).toBeNull();
    }
    expect(listKeyAction(key('F2'), state())).toEqual({ type: 'rename' });
    expect(listKeyAction(key('F2'), state({ selection: [] }))).toBeNull();
  });

  test('Ctrl or Cmd + D duplicates (selection needed), Ctrl or Cmd + A selects all, in either case', () => {
    for (const modifier of ['ctrlKey', 'metaKey']) {
      expect(listKeyAction(key('d', { [modifier]: true }), state())).toEqual({ type: 'duplicate' });
      expect(listKeyAction(key('D', { [modifier]: true }), state())).toEqual({ type: 'duplicate' });
      expect(listKeyAction(key('d', { [modifier]: true }), state({ selection: [] }))).toBeNull();
      expect(listKeyAction(key('a', { [modifier]: true }), state({ selection: [] }))).toEqual({ type: 'select-all' });
      expect(listKeyAction(key('A', { [modifier]: true }), state())).toEqual({ type: 'select-all' });
    }
  });

  test('the bare letters and other keys mean nothing', () => {
    for (const name of ['d', 'a', 'x', 'Enter', ' ']) expect(listKeyAction(key(name), state())).toBeNull();
    expect(listKeyAction(key('x', { ctrlKey: true }), state())).toBeNull();
  });
});

describe('historyKeyAction', () => {
  test('Ctrl or Cmd + Z undoes, with Shift redoes, in either case', () => {
    for (const modifier of ['ctrlKey', 'metaKey']) {
      expect(historyKeyAction(key('z', { [modifier]: true }), false)).toBe('undo');
      expect(historyKeyAction(key('Z', { [modifier]: true }), false)).toBe('undo');
      expect(historyKeyAction(key('z', { [modifier]: true, shiftKey: true }), false)).toBe('redo');
      expect(historyKeyAction(key('Z', { [modifier]: true, shiftKey: true }), false)).toBe('redo');
    }
  });

  test('Ctrl + Y redoes, unless Shift or Alt is held', () => {
    expect(historyKeyAction(key('y', { ctrlKey: true }), false)).toBe('redo');
    expect(historyKeyAction(key('Y', { metaKey: true }), false)).toBe('redo');
    expect(historyKeyAction(key('y', { ctrlKey: true, shiftKey: true }), false)).toBeNull();
    expect(historyKeyAction(key('y', { ctrlKey: true, altKey: true }), false)).toBeNull();
  });

  test('nothing without Ctrl or Cmd, nothing in a text field, nothing for other letters', () => {
    expect(historyKeyAction(key('z'), false)).toBeNull();
    expect(historyKeyAction(key('y'), false)).toBeNull();
    expect(historyKeyAction(key('z', { ctrlKey: true }), true)).toBeNull();
    expect(historyKeyAction(key('x', { ctrlKey: true }), false)).toBeNull();
  });
});
