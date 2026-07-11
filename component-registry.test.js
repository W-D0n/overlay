// @ts-check
import { test, expect } from 'bun:test';
import { COMPONENT_REGISTRY, validateComponentRegistry } from './component-registry.js';
import { COMPONENT_NAMES } from './component-names.js';

test('validateComponentRegistry passes when COMPONENT_REGISTRY matches component-names.js exactly', () => {
  expect(validateComponentRegistry()).toEqual({ ok: true, errors: [] });
});

test('every name in COMPONENT_NAMES resolves to a factory in COMPONENT_REGISTRY', () => {
  for (const name of COMPONENT_NAMES) {
    expect(typeof COMPONENT_REGISTRY[name]).toBe('function');
  }
});
