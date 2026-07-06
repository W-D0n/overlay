/**
 * ShapeMorphBackground.test.js — Tests de `computeRadii`/`lerpRadii` (pures, Track B session B8).
 * Lancement : `bun test`
 */

import { test, expect } from 'bun:test';
import { computeRadii, lerpRadii, SAMPLES, SHAPE_NAMES } from './ShapeMorphBackground.js';

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
