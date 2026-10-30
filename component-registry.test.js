// @ts-check
import { test, expect, afterEach } from 'bun:test';
import { COMPONENT_REGISTRY } from './component-registry.js';
import { EFFECT_KIND_IDS, LAYER_KIND_IDS } from './layer-kinds.js';
import { LAYER_KINDS } from './layer-kinds.js';
import { createLayerHarness } from './components/layer-test-harness.js';

// Le typage (`Record<LayerKindId, …>`, vérifié par `bun dev/typecheck.js`) garantit déjà cette égalité ;
// ce test la rejoue dans la suite par défaut, que le contrôle de types ne fait pas partie de `bun test`.
test('le registre contient exactement une fabrique par type de couche décrit', () => {
  expect(new Set(Object.keys(COMPONENT_REGISTRY))).toEqual(new Set(LAYER_KIND_IDS));
  for (const id of LAYER_KIND_IDS) expect(typeof COMPONENT_REGISTRY[id]).toBe('function');
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

  for (const name of EFFECT_KIND_IDS) {
    const { capabilities } = LAYER_KINDS[name];
    const instance = COMPONENT_REGISTRY[name]({}, createLayerHarness().environment);
    expect(`${name} setAudioLevel ${typeof instance.setAudioLevel === 'function'}`).toBe(`${name} setAudioLevel ${capabilities.audio}`);
    expect(`${name} trigger ${typeof instance.trigger === 'function'}`).toBe(`${name} trigger ${capabilities.reactions === 'native'}`);
    instance.destroy?.();
  }
});
