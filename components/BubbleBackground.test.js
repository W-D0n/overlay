import { afterEach, describe, expect, test } from 'bun:test';
import {
  BubbleBackground,
  bubbleBurstY,
  sampleBurstTravel,
  shouldBurstBubble,
} from './BubbleBackground.js';
import { createLayerHarness } from './layer-test-harness.js';

describe('éclatement aléatoire des bulles', () => {
  test('sampleBurstTravel répartit le trajet entre les deux bornes', () => {
    expect(sampleBurstTravel(0.2, 0.8, () => 0)).toBe(0.2);
    expect(sampleBurstTravel(0.2, 0.8, () => 0.5)).toBeCloseTo(0.5);
    expect(sampleBurstTravel(0.2, 0.8, () => 1)).toBe(0.8);
  });

  test('sampleBurstTravel ordonne et borne les réglages invalides', () => {
    expect(sampleBurstTravel(1.4, -0.2, () => 0)).toBe(0);
    expect(sampleBurstTravel(1.4, -0.2, () => 1)).toBe(1);
  });

  test('une bulle peut éclater au milieu du viewport, avant le bord haut', () => {
    const burstY = bubbleBurstY(1080, 0.5);
    expect(burstY).toBe(540);
    expect(shouldBurstBubble(700, 20, burstY)).toBe(false);
    expect(shouldBurstBubble(539, 20, burstY)).toBe(true);
  });

  test('le bord haut reste un filet de sécurité', () => {
    expect(shouldBurstBubble(-21, 20, 0)).toBe(true);
  });
});

describe('oscillation latérale', () => {
  const originals = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle, random: Math.random };
  afterEach(() => {
    globalThis.document = originals.document;
    globalThis.getComputedStyle = originals.getComputedStyle;
    Math.random = originals.random;
  });

  test('changer la vitesse en cours de route ne change pas la phase de l’oscillation, seulement son amplitude (A2)', () => {
    let seed = 99;
    Math.random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    globalThis.document = /** @type {*} */ ({ createElement: () => ({ style: {}, remove() {} }), body: { appendChild() {} } });
    globalThis.getComputedStyle = /** @type {*} */ (() => ({ color: 'rgb(200, 185, 122)' }));

    const harness = createLayerHarness();
    const instance = BubbleBackground({ speed: 1, count: 1 }, harness.environment);
    const firstX = (calls) => calls.find(([name]) => name === 'arc')[1];
    let x58 = 0;
    let x59 = 0;
    for (let frame = 0; frame < 60; frame += 1) { x58 = x59; x59 = firstX(harness.tick(frame * 16.7)); }
    const before = x59 - x58;

    instance.update?.({ speed: 2 });
    const after = firstX(harness.tick(60 * 16.7)) - x59;

    expect(Math.abs(before)).toBeGreaterThan(0.01);
    // Phase continue : la vitesse doublée double le déplacement latéral (le sinus varie peu en une frame).
    expect(after / before).toBeGreaterThan(1.8);
    expect(after / before).toBeLessThan(2.2);
  });
});
