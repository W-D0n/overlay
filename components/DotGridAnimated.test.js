// @ts-check
/**
 * components/DotGridAnimated.test.js — Tests de la logique pure de `morphTo` (Track A / A3).
 * Bun n'a pas de DOM (`document` indéfini) : `DotGridAnimated()` crée un canvas et n'est donc
 * pas instanciable ici (AD-1, même limite que components/index.test.js). Seuls les helpers purs
 * importés directement (sans appeler la factory) sont testés.
 */
import { test, expect } from 'bun:test';
import { lerpModeParams, easeProgress, MODE_PARAMS } from './DotGridAnimated.js';

const FROM = { freqX: 0, freqY: 0, freqT: 0, amplitude: 0 };
const TO = { freqX: 1, freqY: 2, freqT: 3, amplitude: 4 };

test('lerpModeParams progress 0 → from exact', () => {
  expect(lerpModeParams(FROM, TO, 0)).toEqual(FROM);
});

test('lerpModeParams progress 1 → to exact', () => {
  expect(lerpModeParams(FROM, TO, 1)).toEqual(TO);
});

test('lerpModeParams progress 0.5 → milieu de chaque champ', () => {
  expect(lerpModeParams(FROM, TO, 0.5)).toEqual({ freqX: 0.5, freqY: 1, freqT: 1.5, amplitude: 2 });
});

test('lerpModeParams mode identique (from === to) → constant quelle que soit la progression', () => {
  for (const progress of [0, 0.3, 0.7, 1]) {
    expect(lerpModeParams(MODE_PARAMS.brb, MODE_PARAMS.brb, progress)).toEqual(MODE_PARAMS.brb);
  }
});

test('easeProgress bornes : linear(0) = 0, linear(1) = 1', () => {
  expect(easeProgress('linear', 0)).toBe(0);
  expect(easeProgress('linear', 1)).toBe(1);
});

test('easeProgress clampe une progression hors [0,1]', () => {
  expect(easeProgress('linear', -5)).toBe(0);
  expect(easeProgress('linear', 5)).toBe(1);
});

test('easeProgress jeton hors domaine → repli easeInOut (cohérent avec toCssEasing)', () => {
  expect(easeProgress('bounce', 0.5)).toBe(easeProgress('easeInOut', 0.5));
  expect(easeProgress(undefined, 0.5)).toBe(easeProgress('easeInOut', 0.5));
});

test('easeProgress chaque jeton valide reste borné à [0,1] sur tout le domaine', () => {
  for (const easing of ['linear', 'easeIn', 'easeOut', 'easeInOut']) {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const eased = easeProgress(easing, t);
      expect(eased).toBeGreaterThanOrEqual(0);
      expect(eased).toBeLessThanOrEqual(1);
    }
  }
});
