import { expect, test } from 'bun:test';
import { canvasPixelRatio } from './canvas-runtime.js';

test('canvasPixelRatio caps high-density screens at 2 by default', () => {
  expect(canvasPixelRatio(3, '')).toBe(2);
});

test('canvasPixelRatio caps at 1 in the performance URL profile', () => {
  expect(canvasPixelRatio(2.5, '?quality=performance')).toBe(1);
});

test('canvasPixelRatio preserves ordinary ratios and rejects invalid input', () => {
  expect(canvasPixelRatio(1.5, '')).toBe(1.5);
  expect(canvasPixelRatio(Number.NaN, '')).toBe(1);
});
