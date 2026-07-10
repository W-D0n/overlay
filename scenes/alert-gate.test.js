// @ts-check
import { test, expect } from 'bun:test';
import { createAlertGate } from './alert-gate.js';

test('createAlertGate returns false when alert is null', () => {
  const isNew = createAlertGate();
  expect(isNew(null)).toBe(false);
});

test('createAlertGate returns true on the first alert', () => {
  const isNew = createAlertGate();
  expect(isNew({ type: 'follow', username: 'a', timestamp: 1 })).toBe(true);
});

test('createAlertGate returns false on repeated calls with the same timestamp', () => {
  const isNew = createAlertGate();
  isNew({ type: 'follow', username: 'a', timestamp: 1 });
  expect(isNew({ type: 'follow', username: 'a', timestamp: 1 })).toBe(false);
});

test('createAlertGate returns true again once the timestamp changes', () => {
  const isNew = createAlertGate();
  isNew({ type: 'follow', username: 'a', timestamp: 1 });
  expect(isNew({ type: 'sub', username: 'b', timestamp: 2 })).toBe(true);
});

test('createAlertGate keeps separate state across independent instances', () => {
  const isNewA = createAlertGate();
  const isNewB = createAlertGate();
  isNewA({ type: 'follow', username: 'a', timestamp: 1 });
  expect(isNewB({ type: 'follow', username: 'a', timestamp: 1 })).toBe(true);
});
