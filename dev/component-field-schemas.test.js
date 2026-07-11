// @ts-check
import { test, expect } from 'bun:test';
import { validateFieldSchemas, COMPOSABLE_COMPONENT_NAMES, BACKGROUND_COMPONENT_NAMES } from './component-field-schemas.js';
import { COMPONENT_NAMES } from '../component-names.js';

test('validateFieldSchemas passes when composable + background schemas cover component-names.js exactly', () => {
  expect(validateFieldSchemas()).toEqual({ ok: true, errors: [] });
});

test('COMPOSABLE_COMPONENT_NAMES and BACKGROUND_COMPONENT_NAMES together equal COMPONENT_NAMES, no overlap', () => {
  const covered = [...COMPOSABLE_COMPONENT_NAMES, ...BACKGROUND_COMPONENT_NAMES];
  expect(new Set(covered).size).toBe(covered.length);
  expect(new Set(covered)).toEqual(new Set(COMPONENT_NAMES));
});
