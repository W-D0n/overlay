import { describe, expect, test } from 'bun:test';
import { NUDGE_PX, NUDGE_SHIFT_PX, canvasKeyAction } from './canvas-keys.js';

const key = (name, over = {}) => ({ key: name, shiftKey: false, ctrlKey: false, metaKey: false, ...over });

describe('canvasKeyAction', () => {
  test('an arrow nudges by one pixel, ten with Shift, along its own axis only, and always cancels the page scroll', () => {
    expect(canvasKeyAction(key('ArrowLeft'), false)).toEqual({ type: 'nudge', dx: -1, dy: 0, prevent: true });
    expect(canvasKeyAction(key('ArrowRight'), false)).toEqual({ type: 'nudge', dx: 1, dy: 0, prevent: true });
    expect(canvasKeyAction(key('ArrowUp'), false)).toEqual({ type: 'nudge', dx: 0, dy: -1, prevent: true });
    expect(canvasKeyAction(key('ArrowDown'), false)).toEqual({ type: 'nudge', dx: 0, dy: 1, prevent: true });
    expect(canvasKeyAction(key('ArrowLeft', { shiftKey: true }), true)).toEqual({ type: 'nudge', dx: -10, dy: 0, prevent: true });
    expect(canvasKeyAction(key('ArrowDown', { shiftKey: true }), true)).toEqual({ type: 'nudge', dx: 0, dy: 10, prevent: true });
    expect([NUDGE_PX, NUDGE_SHIFT_PX]).toEqual([1, 10]);
  });

  test('Delete and Backspace remove, only when something is selected', () => {
    for (const name of ['Delete', 'Backspace']) {
      expect(canvasKeyAction(key(name), true)).toEqual({ type: 'remove', prevent: true });
      expect(canvasKeyAction(key(name), false)).toBeNull();
    }
  });

  test('Ctrl or Cmd + D duplicates (selection needed), Ctrl or Cmd + A selects all, in either case', () => {
    for (const modifier of ['ctrlKey', 'metaKey']) {
      expect(canvasKeyAction(key('d', { [modifier]: true }), true)).toEqual({ type: 'duplicate', prevent: true });
      expect(canvasKeyAction(key('D', { [modifier]: true }), true)).toEqual({ type: 'duplicate', prevent: true });
      expect(canvasKeyAction(key('d', { [modifier]: true }), false)).toBeNull();
      expect(canvasKeyAction(key('a', { [modifier]: true }), false)).toEqual({ type: 'select-all', prevent: true });
      expect(canvasKeyAction(key('A', { [modifier]: true }), true)).toEqual({ type: 'select-all', prevent: true });
    }
  });

  test('the bare letters d and a mean nothing, and neither does another letter with Ctrl', () => {
    expect(canvasKeyAction(key('d'), true)).toBeNull();
    expect(canvasKeyAction(key('a'), true)).toBeNull();
    expect(canvasKeyAction(key('x', { ctrlKey: true }), true)).toBeNull();
  });

  test('Escape clears the selection, and the zoom keys leave the browser alone', () => {
    expect(canvasKeyAction(key('Escape'), true)).toEqual({ type: 'clear-selection', prevent: false });
    expect(canvasKeyAction(key('+'), false)).toEqual({ type: 'zoom-in', prevent: false });
    expect(canvasKeyAction(key('='), false)).toEqual({ type: 'zoom-in', prevent: false });
    expect(canvasKeyAction(key('-'), false)).toEqual({ type: 'zoom-out', prevent: false });
    expect(canvasKeyAction(key('0'), false)).toEqual({ type: 'fit', prevent: false });
    expect(canvasKeyAction(key('1'), false)).toEqual({ type: 'actual-size', prevent: false });
  });

  test('any other key means nothing', () => {
    for (const name of ['x', 'Enter', 'Tab', '2', 'F5', ' ']) expect(canvasKeyAction(key(name), true)).toBeNull();
  });
});
