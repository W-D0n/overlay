// @ts-check
/**
 * components/DotGridAnimated.test.js — Tests de la logique pure de `morphTo` (Track A / A3).
 * Bun n'a pas de DOM (`document` indéfini) : `DotGridAnimated()` crée un canvas et n'est donc
 * pas instanciable ici (AD-1, même limite que components/index.test.js). Seuls les helpers purs
 * importés directement (sans appeler la factory) sont testés.
 */
import { test, expect } from 'bun:test';
import {
  lerpModeParams, easeProgress, MODE_PARAMS, degToLUTIndex, buildColorRamp,
  isValidReactionType, computeAmbientDelay, reactionDelta, REACTION_TYPES,
} from './DotGridAnimated.js';

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

test('degToLUTIndex mappe deg=-maxDeg/0/+maxDeg sur les index 0/maxDeg/2*maxDeg', () => {
  expect(degToLUTIndex(-30, 30)).toBe(0);
  expect(degToLUTIndex(0, 30)).toBe(30);
  expect(degToLUTIndex(30, 30)).toBe(60);
});

test('degToLUTIndex clampe un deg hors [-maxDeg,maxDeg] (simplex2 peut légèrement dépasser [-1,1])', () => {
  expect(degToLUTIndex(31.5, 30)).toBe(60);
  expect(degToLUTIndex(-31.5, 30)).toBe(0);
  expect(degToLUTIndex(1000, 30)).toBe(60);
  expect(degToLUTIndex(-1000, 30)).toBe(0);
});

test('buildColorRamp interpole les deux couleurs avec un milieu exact', () => {
  expect(buildColorRamp([0, 20, 40], [100, 120, 140], 1)).toEqual([
    [0, 20, 40],
    [50, 70, 90],
    [100, 120, 140],
  ]);
});

// ── Couche 4 — réactions (docs/specs/dotgrid-event-triggers.md) ─────────────

test('isValidReactionType accepte les 4 types, rejette le reste (AC-05)', () => {
  for (const type of REACTION_TYPES) expect(isValidReactionType(type)).toBe(true);
  expect(isValidReactionType('inconnu')).toBe(false);
  expect(isValidReactionType(undefined)).toBe(false);
  expect(isValidReactionType(42)).toBe(false);
});

test('computeAmbientDelay reste dans [45000,90000] (AC-07)', () => {
  expect(computeAmbientDelay(0)).toBe(45000);
  expect(computeAmbientDelay(1)).toBe(90000);
  expect(computeAmbientDelay(0.5)).toBe(67500);
});

test('reactionDelta type inconnu → 0 (défensif)', () => {
  expect(reactionDelta({ type: /** @type {*} */ ('nope'), params: {} }, 0, 0, 0, 1920, 1080, 0.5)).toBe(0);
});

test('reactionDelta sub → boost uniforme, identique quelle que soit la position', () => {
  const reaction = { type: /** @type {const} */ ('sub'), params: {} };
  const a = reactionDelta(reaction, 0, 0, 0, 1920, 1080, 0.5);
  const b = reactionDelta(reaction, 1, 1900, 1000, 1920, 1080, 0.5);
  expect(a).toBeCloseTo(b, 10);
  expect(a).toBeGreaterThan(0);
});

test('reactionDelta sub → nul aux bornes de progression (sin(0)=sin(π)=0)', () => {
  const reaction = { type: /** @type {const} */ ('sub'), params: {} };
  expect(reactionDelta(reaction, 0, 100, 100, 1920, 1080, 0)).toBeCloseTo(0, 10);
  expect(reactionDelta(reaction, 0, 100, 100, 1920, 1080, 1)).toBeCloseTo(0, 10);
});

test('reactionDelta follow → maximal près du front de l\'onde, nul loin du front', () => {
  const reaction = { type: /** @type {const} */ ('follow'), params: { cx: 0, cy: 0 } };
  // progress=0.5 → rayon = 0.5 * diagonale ≈ point à (radius,0), pile sur le front
  const maxRadius = Math.sqrt(1920 * 1920 + 1080 * 1080);
  const radius = 0.5 * maxRadius;
  const onFront = reactionDelta(reaction, 0, radius, 0, 1920, 1080, 0.5);
  const farFromFront = reactionDelta(reaction, 0, 0, 0, 1920, 1080, 0.5); // dist=0, loin du front à mi-parcours
  expect(onFront).toBeGreaterThan(farFromFront);
  expect(onFront).toBeGreaterThan(0.4); // proche de l'amplitude max (0.5)
});

test('reactionDelta raid → nul en dehors de la bande, positif dedans', () => {
  const reaction = { type: /** @type {const} */ ('raid'), params: {} };
  // à progress=0.5, la bande est centrée sur l'écran (cssW/2 environ)
  const inBand = reactionDelta(reaction, 0, 960, 0, 1920, 1080, 0.5);
  const outOfBand = reactionDelta(reaction, 0, 1920 * 5, 0, 1920, 1080, 0.5);
  expect(inBand).toBeGreaterThan(0);
  expect(outOfBand).toBe(0);
});

test('reactionDelta bits → seuls les points dans indices reçoivent un boost', () => {
  const reaction = { type: /** @type {const} */ ('bits'), params: { indices: new Set([2, 5]) } };
  expect(reactionDelta(reaction, 2, 0, 0, 1920, 1080, 0.5)).toBeGreaterThan(0);
  expect(reactionDelta(reaction, 5, 0, 0, 1920, 1080, 0.5)).toBeGreaterThan(0);
  expect(reactionDelta(reaction, 3, 0, 0, 1920, 1080, 0.5)).toBe(0);
});
