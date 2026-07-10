// @ts-check
/**
 * components/color-utils.test.js — Logique pure de `hueShiftRgb` (LAC-02, DotGridAnimated).
 * `resolveColor` nécessite un DOM (probe + getComputedStyle), non testable ici (AD-1).
 */
import { test, expect } from 'bun:test';
import { hueShiftRgb, buildHueShiftLUT } from './color-utils.js';

test('hueShiftRgb delta 0 → couleur inchangée (à l\'arrondi près)', () => {
  const [r, g, b] = hueShiftRgb([200, 185, 122], 0);
  expect(r).toBeCloseTo(200, 0);
  expect(g).toBeCloseTo(185, 0);
  expect(b).toBeCloseTo(122, 0);
});

test('hueShiftRgb delta 360 → équivalent à delta 0 (cycle complet)', () => {
  const base = hueShiftRgb([200, 185, 122], 0);
  const cycled = hueShiftRgb([200, 185, 122], 360);
  expect(cycled[0]).toBeCloseTo(base[0], 0);
  expect(cycled[1]).toBeCloseTo(base[1], 0);
  expect(cycled[2]).toBeCloseTo(base[2], 0);
});

test('hueShiftRgb couleur achromatique (gris) → inchangée quel que soit le delta', () => {
  expect(hueShiftRgb([128, 128, 128], 90)).toEqual([128, 128, 128]);
  expect(hueShiftRgb([0, 0, 0], 45)).toEqual([0, 0, 0]);
  expect(hueShiftRgb([255, 255, 255], 180)).toEqual([255, 255, 255]);
});

test('hueShiftRgb delta tres negatif (< -360) reste equivalent au meme delta module 360', () => {
  expect(hueShiftRgb([200, 185, 122], -720)).toEqual(hueShiftRgb([200, 185, 122], 0));
  expect(hueShiftRgb([200, 185, 122], -450)).toEqual(hueShiftRgb([200, 185, 122], -90));
});

test('hueShiftRgb decale effectivement la teinte pour une couleur saturee', () => {
  const shifted = hueShiftRgb([200, 185, 122], 180);
  expect(shifted).not.toEqual([200, 185, 122]);
});

test('buildHueShiftLUT a 2*maxDeg+1 entrees, identiques a hueShiftRgb degre par degre', () => {
  const rgb = /** @type {[number,number,number]} */ ([200, 185, 122]);
  const maxDeg = 30;
  const lut = buildHueShiftLUT(rgb, maxDeg);
  expect(lut.length).toBe(2 * maxDeg + 1);
  for (const deg of [-30, -15, 0, 15, 30]) {
    expect(lut[deg + maxDeg]).toEqual(hueShiftRgb(rgb, deg));
  }
});

test('hueShiftRgb retourne des canaux dans [0,255]', () => {
  for (const delta of [-720, -90, 0, 90, 200, 720]) {
    const [r, g, b] = hueShiftRgb([200, 185, 122], delta);
    for (const c of [r, g, b]) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(255);
    }
  }
});
