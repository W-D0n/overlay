import { expect, test } from 'bun:test';
import { rippleEnvelope, WATER_RIPPLE_SHAPES } from './WaterRippleBackground.js';

test('WATER_RIPPLE_SHAPES expose les trois géométries réglables', () => {
  expect(WATER_RIPPLE_SHAPES).toEqual(['circle', 'ellipse', 'diamond']);
});

test('rippleEnvelope attaque puis s’éteint, bornée par amplitude', () => {
  expect(rippleEnvelope(0, 0.7)).toBe(0);
  expect(rippleEnvelope(0.125, 0.7)).toBeGreaterThan(0.5);
  expect(rippleEnvelope(1, 0.7)).toBe(0);
  expect(rippleEnvelope(0.4, 2)).toBeLessThanOrEqual(1);
  expect(rippleEnvelope(-1, 0.7)).toBe(0);
});
