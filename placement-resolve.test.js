// @ts-check
import { test, expect } from 'bun:test';
import { resolvePlacementStyle } from './placement-resolve.js';

test('resolvePlacementStyle returns position/left/top without width/height when absent', () => {
  expect(resolvePlacementStyle({ x: 40, y: 80 })).toEqual({
    position: 'absolute',
    left: '40px',
    top: '80px',
  });
});

test('resolvePlacementStyle includes width/height in px when provided', () => {
  expect(resolvePlacementStyle({ x: 40, y: 80, width: 1080, height: 960 })).toEqual({
    position: 'absolute',
    left: '40px',
    top: '80px',
    width: '1080px',
    height: '960px',
  });
});

test('resolvePlacementStyle handles x/y = 0 (falsy but valid)', () => {
  expect(resolvePlacementStyle({ x: 0, y: 0 })).toEqual({
    position: 'absolute',
    left: '0px',
    top: '0px',
  });
});

test('resolvePlacementStyle handles width or height individually', () => {
  expect(resolvePlacementStyle({ x: 10, y: 10, width: 200 })).toEqual({
    position: 'absolute',
    left: '10px',
    top: '10px',
    width: '200px',
  });
});
