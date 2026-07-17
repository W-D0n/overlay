import { expect, test } from 'bun:test';
import { clampNumericFieldValue } from './numeric-field-control.js';

test('clampNumericFieldValue borne les saisies exactes et gère une valeur invalide', () => {
  expect(clampNumericFieldValue(-2, 0, 5)).toBe(0);
  expect(clampNumericFieldValue(8, 0, 5)).toBe(5);
  expect(clampNumericFieldValue(2.5, 0, 5)).toBe(2.5);
  expect(clampNumericFieldValue(Number.NaN, 0, 5)).toBe(0);
});
