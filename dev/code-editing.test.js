import { describe, expect, test } from 'bun:test';
import { applyEdit, indent, lineCount, newline, outdent } from './code-editing.js';

const run = (fn, text, start, end = start) => {
  const edit = fn(text, start, end);
  return edit === null ? null : applyEdit(text, edit);
};

describe('indent', () => {
  test('a caret gets two spaces', () => {
    expect(run(indent, 'ab', 1)).toEqual({ text: 'a  b', start: 3, end: 3 });
  });

  test('a selection inside one line is replaced by the indentation', () => {
    expect(run(indent, 'abcd', 1, 3)).toEqual({ text: 'a  d', start: 3, end: 3 });
  });

  test('several lines are all indented, and the selection keeps covering them', () => {
    const result = run(indent, 'a\nb\nc', 0, 5);
    expect(result.text).toBe('  a\n  b\n  c');
    expect(result.start).toBe(2);
    expect(result.end).toBe(11);
  });

  test('a selection starting in the middle of a line indents that whole line', () => {
    expect(run(indent, 'abc\ndef', 2, 6).text).toBe('  abc\n  def');
  });

  test('a selection ending at the start of a line does not touch that line', () => {
    expect(run(indent, 'a\nb\nc', 0, 4).text).toBe('  a\n  b\nc');
  });

  test('empty lines stay empty', () => {
    expect(run(indent, 'a\n\nb', 0, 4).text).toBe('  a\n\n  b');
  });
});

describe('outdent', () => {
  test('takes two spaces off the current line, and moves the caret with them', () => {
    expect(run(outdent, '    a', 5)).toEqual({ text: '  a', start: 3, end: 3 });
  });

  test('takes fewer when there are fewer; a tab counts as one', () => {
    expect(run(outdent, ' a', 2).text).toBe('a');
    expect(run(outdent, '\ta', 2).text).toBe('a');
  });

  test('every touched line, each by its own share', () => {
    expect(run(outdent, '  a\n b\nc', 0, 8).text).toBe('a\nb\nc');
  });

  test('nothing to take off: no edit', () => {
    expect(run(outdent, 'a\nb', 0, 3)).toBeNull();
  });

  test('the caret never goes before its line', () => {
    expect(run(outdent, '  a', 1).start).toBe(0);
  });

  test('a selection ending at the start of a line leaves that line alone', () => {
    expect(run(outdent, '  a\n  b', 0, 4).text).toBe('a\n  b');
  });
});

describe('newline', () => {
  test('keeps the indentation of the line', () => {
    expect(run(newline, '  ab', 4)).toEqual({ text: '  ab\n  ', start: 7, end: 7 });
  });

  test('splits a line at the caret and keeps the indentation for the rest', () => {
    expect(run(newline, '  abcd', 4).text).toBe('  ab\n  cd');
  });

  test('after an opening bracket, one level deeper', () => {
    expect(run(newline, 'if (x) {', 8)).toEqual({ text: 'if (x) {\n  ', start: 11, end: 11 });
    expect(run(newline, '  f(', 4).text).toBe('  f(\n    ');
  });

  test('between a bracket and its closer, the closer goes to its own line', () => {
    expect(run(newline, '{}', 1)).toEqual({ text: '{\n  \n}', start: 4, end: 4 });
    expect(run(newline, '  []', 3).text).toBe('  [\n    \n  ]');
  });

  test('a mismatched closer does not open a block', () => {
    expect(run(newline, '{)', 1).text).toBe('{\n  )');
  });

  test('a selection is replaced by the new line', () => {
    expect(run(newline, 'abcd', 1, 3).text).toBe('a\nd');
  });
});

describe('lineCount', () => {
  test('at least one, one more per newline', () => {
    expect(lineCount('')).toBe(1);
    expect(lineCount('a\nb\n')).toBe(3);
  });
});
