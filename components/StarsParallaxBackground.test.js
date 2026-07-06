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
