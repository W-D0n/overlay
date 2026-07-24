// @ts-check
import { test, expect } from 'bun:test';
import { COMPONENT_NAMES } from './component-names.js';

test('COMPONENT_NAMES is a non-empty list of unique strings', () => {
  expect(COMPONENT_NAMES.length).toBeGreaterThan(0);
  expect(new Set(COMPONENT_NAMES).size).toBe(COMPONENT_NAMES.length);
});

test('every declared name is a background effect', () => {
  COMPONENT_NAMES.forEach((name) => expect(name.endsWith('Background')).toBe(true));
});
