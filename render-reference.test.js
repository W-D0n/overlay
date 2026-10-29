import { expect, test } from 'bun:test';

import { referenceScale } from './render-reference.js';
test('l’échelle de référence vaut 1 à la hauteur de référence et suit la hauteur réelle', () => {
  expect(referenceScale(1080)).toBe(1);
  expect(referenceScale(2160)).toBe(2);
  expect(referenceScale(1440)).toBeCloseTo(4 / 3, 10);
  expect(referenceScale(0)).toBe(1);
  expect(referenceScale(Number.NaN)).toBe(1);
});
