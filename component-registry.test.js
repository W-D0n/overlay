// @ts-check
import { test, expect, afterEach } from 'bun:test';
import { COMPONENT_REGISTRY } from './component-registry.js';
import { COMPONENT_NAMES } from './component-names.js';
import { LAYER_KINDS } from './layer-kinds.js';
import { createLayerHarness } from './components/layer-test-harness.js';

test('every name in COMPONENT_NAMES resolves to a factory in COMPONENT_REGISTRY', () => {
  for (const name of COMPONENT_NAMES) {
    expect(typeof COMPONENT_REGISTRY[name]).toBe('function');
  }
});

test('COMPONENT_REGISTRY exposes no factory missing from component-names.js', () => {
  expect(new Set(Object.keys(COMPONENT_REGISTRY))).toEqual(new Set(COMPONENT_NAMES));
});

const ORIGINALS = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
afterEach(() => {
  globalThis.document = ORIGINALS.document;
  globalThis.getComputedStyle = ORIGINALS.getComputedStyle;
});

test('contrat : chaque effet expose setAudioLevel et trigger exactement comme son type de couche le déclare', () => {
  const element = () => ({ style: {}, remove() {}, animate: () => ({ cancel() {}, updatePlaybackRate() {} }), appendChild() {} });
  globalThis.document = /** @type {*} */ ({ createElement: element, body: { appendChild() {} } });
  globalThis.getComputedStyle = /** @type {*} */ (() => ({ color: 'rgb(200, 185, 122)' }));

  for (const name of COMPONENT_NAMES) {
    const { capabilities } = LAYER_KINDS[name];
    const instance = COMPONENT_REGISTRY[name]({}, createLayerHarness().environment);
    expect(`${name} setAudioLevel ${typeof instance.setAudioLevel === 'function'}`).toBe(`${name} setAudioLevel ${capabilities.audio}`);
    expect(`${name} trigger ${typeof instance.trigger === 'function'}`).toBe(`${name} trigger ${capabilities.reactions === 'native'}`);
    instance.destroy?.();
  }
});
