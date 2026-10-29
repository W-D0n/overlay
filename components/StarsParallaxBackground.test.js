/**
 * StarsParallaxBackground.test.js — Tests de `generateStarLayer` (Track B session B6).
 * Lancement : `bun test`
 */

import { test, expect } from 'bun:test';
import { generateStarLayer } from './StarsParallaxBackground.js';

test('T01 [Track B] generateStarLayer retourne exactement `count` étoiles', () => {
  const stars = generateStarLayer(50, 1920, 1080);
  expect(stars.length).toBe(50);
});

test('T02 [Track B] chaque étoile est dans les bornes [0, width) x [0, height)', () => {
  const stars = generateStarLayer(200, 1920, 1080);
  for (const s of stars) {
    expect(s.x).toBeGreaterThanOrEqual(0);
    expect(s.x).toBeLessThan(1920);
    expect(s.y).toBeGreaterThanOrEqual(0);
    expect(s.y).toBeLessThan(1080);
  }
});

test('T03 [Track B] count = 0 → tableau vide', () => {
  expect(generateStarLayer(0, 1920, 1080)).toEqual([]);
});

test('T04 [Track B] count négatif → tableau vide (jamais d\'erreur)', () => {
  expect(generateStarLayer(-5, 1920, 1080)).toEqual([]);
});

import { StarsParallaxBackground } from './StarsParallaxBackground.js';
import { createLayerHarness } from './layer-test-harness.js';

test('T05 [A2] changer la vitesse en cours de route ne déplace pas les étoiles : seul l’avenir change', () => {
  globalThis.document = {
    createElement: (tag) => (tag === 'canvas' ? null : { style: {}, remove() {} }),
    body: { appendChild() {} },
  };
  globalThis.getComputedStyle = () => ({ color: 'rgb(255, 255, 255)' });
  const harness = createLayerHarness();
  globalThis.document.createElement = (tag) => (tag === 'canvas' ? harness.environment.documentRef.createElement() : { style: {}, remove() {} });

  const instance = StarsParallaxBackground({ speed: 1 }, harness.environment);
  const firstStarY = (calls) => calls.find(([name]) => name === 'arc')[2];
  let previous = 0;
  for (let frame = 0; frame < 60; frame += 1) previous = firstStarY(harness.tick(frame * 16.7));

  instance.update({ speed: 2 });
  const after = firstStarY(harness.tick(60 * 16.7));
  const movement = (after - previous + 1080) % 1080;
  // Couche la plus lente : 20 px/s × 0,2 × vitesse 2 × 16,7 ms ≈ 0,13 px ; l'ancien calcul sautait de ≈ 4 px.
  expect(movement).toBeLessThan(0.2);
  delete globalThis.document;
  delete globalThis.getComputedStyle;
});
