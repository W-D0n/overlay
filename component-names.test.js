// @ts-check
import { test, expect } from 'bun:test';
import { COMPONENT_NAMES, isBackgroundComponent } from './component-names.js';

test('COMPONENT_NAMES is a non-empty list of unique strings', () => {
  expect(COMPONENT_NAMES.length).toBeGreaterThan(0);
  expect(new Set(COMPONENT_NAMES).size).toBe(COMPONENT_NAMES.length);
});

test('isBackgroundComponent is true for every name ending in Background', () => {
  expect(isBackgroundComponent('DotGridBackground')).toBe(true);
  expect(isBackgroundComponent('RainBackground')).toBe(true);
});

test('isBackgroundComponent is false for a non-background component', () => {
  expect(isBackgroundComponent('StatBlock')).toBe(false);
  expect(isBackgroundComponent('TextLabel')).toBe(false);
});

test('every *Background entry in COMPONENT_NAMES is recognized by isBackgroundComponent', () => {
  const backgrounds = COMPONENT_NAMES.filter((n) => n.endsWith('Background'));
  expect(backgrounds.length).toBeGreaterThan(0);
  backgrounds.forEach((n) => expect(isBackgroundComponent(n)).toBe(true));
});
