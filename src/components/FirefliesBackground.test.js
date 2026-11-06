import { afterEach, describe, expect, test } from 'bun:test';
import { FirefliesBackground } from './FirefliesBackground.js';
import { createLayerHarness } from './layer-test-harness.js';

const ORIGINALS = {
  document: globalThis.document,
  getComputedStyle: globalThis.getComputedStyle,
  random: Math.random,
};

afterEach(() => {
  globalThis.document = ORIGINALS.document;
  globalThis.getComputedStyle = ORIGINALS.getComputedStyle;
  Math.random = ORIGINALS.random;
});

describe('FirefliesBackground — temps d’errance', () => {
  test('changer la vitesse en cours de route ne fait pas sauter les lucioles : seul l’avenir change (A2)', () => {
    let seed = 777;
    Math.random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    globalThis.document = /** @type {*} */ ({ createElement: () => ({ style: {}, remove() {} }), body: { appendChild() {} } });
    globalThis.getComputedStyle = /** @type {*} */ (() => ({ color: 'rgb(200, 185, 122)' }));

    const harness = createLayerHarness();
    const instance = FirefliesBackground({ speed: 1, flashChance: 0 }, harness.environment);
    const firstArc = (calls) => calls.find(([name]) => name === 'arc').slice(1, 3);
    let previous = [0, 0];
    for (let frame = 0; frame < 60; frame += 1) previous = firstArc(harness.tick(frame * 16.7));

    instance.update?.({ speed: 2 });
    const after = firstArc(harness.tick(60 * 16.7));
    const distance = Math.hypot(after[0] - previous[0], after[1] - previous[1]);
    // Au plus : rayon 160 px x fréquence 0,3 rad/s x vitesse 2 x 16,7 ms = 1,6 px.
    expect(distance).toBeLessThan(3);
  });
});
