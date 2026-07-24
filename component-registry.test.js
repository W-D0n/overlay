// @ts-check
import { test, expect } from 'bun:test';
import { COMPONENT_REGISTRY } from './component-registry.js';
import { COMPONENT_NAMES } from './component-names.js';

test('every name in COMPONENT_NAMES resolves to a factory in COMPONENT_REGISTRY', () => {
  for (const name of COMPONENT_NAMES) {
    expect(typeof COMPONENT_REGISTRY[name]).toBe('function');
  }
});

test('COMPONENT_REGISTRY exposes no factory missing from component-names.js', () => {
  expect(new Set(Object.keys(COMPONENT_REGISTRY))).toEqual(new Set(COMPONENT_NAMES));
});
