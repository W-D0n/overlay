/**
 * ShapeMorphBackground.test.js — Tests de `computeRadii`/`lerpRadii` (pures, Track B session B8).
 * Lancement : `bun test`
 */

import { test, expect, afterEach } from 'bun:test';
import { buildPatternLayout, computeRadii, lerpRadii, SAMPLES, SHAPE_NAMES, ShapeMorphBackground } from './ShapeMorphBackground.js';
import { createLayerHarness } from './layer-test-harness.js';

test('T01 [Track B B8] computeRadii — chaque silhouette retourne SAMPLES rayons', () => {
  for (const shape of SHAPE_NAMES) {
    expect(computeRadii(shape).length).toBe(SAMPLES);
  }
});

test('T02 [Track B B8] computeRadii — tous les rayons sont finis et non-négatifs', () => {
  for (const shape of SHAPE_NAMES) {
    const radii = computeRadii(shape);
    for (const r of radii) {
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
    }
  }
});

test('T03 [Track B B8] computeRadii — silhouette inconnue → rayon constant 0.5 (repli)', () => {
  const radii = computeRadii('inconnue');
  for (const r of radii) expect(r).toBe(0.5);
});

test('T04 [Track B B8] lerpRadii — progress 0 retourne exactement `from`', () => {
  const from = computeRadii('pizza');
  const to = computeRadii('ninjaStar');
  expect(lerpRadii(from, to, 0)).toEqual(from);
});

test('T05 [Track B B8] lerpRadii — progress 1 retourne exactement `to`', () => {
  const from = computeRadii('pizza');
  const to = computeRadii('ninjaStar');
  expect(lerpRadii(from, to, 1)).toEqual(to);
});

test('T06 [Track B B8] lerpRadii — progress 0.5 est la moyenne point par point', () => {
  const from = new Float32Array([0, 1, 0.4]);
  const to = new Float32Array([1, 0, 0.6]);
  const mid = lerpRadii(from, to, 0.5);
  expect(mid[0]).toBeCloseTo(0.5, 5);
  expect(mid[1]).toBeCloseTo(0.5, 5);
  expect(mid[2]).toBeCloseTo(0.5, 5);
});

test('T07 [Track B B8] SHAPE_NAMES contient les 5 silhouettes du chantier original', () => {
  expect([...SHAPE_NAMES].sort()).toEqual(
    ['batmanMask', 'helmet', 'ninjaStar', 'pizza', 'shell'].sort(),
  );
});

test('buildPatternLayout distribue toutes les formes dans les bornes demandées', () => {
  const layout = buildPatternLayout(12, 0.8);
  expect(layout).toHaveLength(12);
  for (const item of layout) {
    expect(Math.abs(item.x)).toBeLessThanOrEqual(0.4);
    expect(Math.abs(item.y)).toBeLessThanOrEqual(0.4);
    expect(item.scale).toBeGreaterThan(0);
  }
});

test('buildPatternLayout centre le cas à une seule forme', () => {
  expect(buildPatternLayout(1, 1)[0]).toMatchObject({ x: 0, y: 0 });
});

const SPIN_ORIGINALS = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
afterEach(() => {
  globalThis.document = SPIN_ORIGINALS.document;
  globalThis.getComputedStyle = SPIN_ORIGINALS.getComputedStyle;
});

test('[A2] changer la vitesse de rotation en cours de route ne fait pas sauter les formes : seul l’avenir change', () => {
  globalThis.document = /** @type {*} */ ({ createElement: () => ({ style: {}, remove() {} }), body: { appendChild() {} } });
  globalThis.getComputedStyle = /** @type {*} */ (() => ({ color: 'rgb(200, 185, 122)' }));
  const harness = createLayerHarness();
  const instance = ShapeMorphBackground({ rotationSpeed: 0.3, count: 1 }, harness.environment);
  const firstRotation = (calls) => calls.find(([name]) => name === 'rotate')[1];
  let previous = 0;
  for (let frame = 0; frame < 60; frame += 1) previous = firstRotation(harness.tick(frame * 16.7));

  instance.update?.({ rotationSpeed: 0.6 });
  const after = firstRotation(harness.tick(60 * 16.7));
  // 0,6 rad/s × 16,7 ms ≈ 0,01 rad ; l'ancien calcul sautait de ≈ 0,3 rad (timestamp × vitesse).
  expect(Math.abs(after - previous)).toBeLessThan(0.05);
});
