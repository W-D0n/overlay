// @ts-check
import { test, expect } from 'bun:test';
import { resolveBoundValue, resolveBoundOptions, hasBoundOptions } from './scene-definition-resolve.js';

const STATE = /** @type {*} */ ({
  subjectLine: 'Sculpt',
  viewers: 42,
  sessionStats: { maxViewers: 100, newFollows: 3 },
});

test('resolveBoundValue returns the literal value when not bound', () => {
  expect(resolveBoundValue('hello', STATE)).toBe('hello');
  expect(resolveBoundValue(42, STATE)).toBe(42);
});

test('resolveBoundValue resolves a top-level $bind path', () => {
  expect(resolveBoundValue({ $bind: 'subjectLine' }, STATE)).toBe('Sculpt');
});

test('resolveBoundValue resolves a nested $bind path', () => {
  expect(resolveBoundValue({ $bind: 'sessionStats.maxViewers' }, STATE)).toBe(100);
});

test('resolveBoundValue returns undefined for a missing path, never throws', () => {
  expect(resolveBoundValue({ $bind: 'nope.really.not.there' }, STATE)).toBeUndefined();
});

test('resolveBoundOptions resolves each key independently, mixing literal and bound', () => {
  const resolved = resolveBoundOptions({
    text: { $bind: 'subjectLine' },
    color: '#fff',
    count: { $bind: 'viewers' },
  }, STATE);
  expect(resolved).toEqual({ text: 'Sculpt', color: '#fff', count: 42 });
});

test('resolveBoundOptions on an empty object returns an empty object', () => {
  expect(resolveBoundOptions({}, STATE)).toEqual({});
});

test('hasBoundOptions is true if at least one option is bound', () => {
  expect(hasBoundOptions({ text: { $bind: 'subjectLine' }, color: '#fff' })).toBe(true);
});

test('hasBoundOptions is false if all options are literal', () => {
  expect(hasBoundOptions({ text: 'static', color: '#fff' })).toBe(false);
  expect(hasBoundOptions({})).toBe(false);
});
