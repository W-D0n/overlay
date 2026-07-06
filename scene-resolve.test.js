/**
 * scene-resolve.test.js — Tests autonomes des helpers purs du runtime (S3).
 * Lancement : `bun test`
 *
 * Numérotation T## continue sur tout le fichier (jamais réinitialisée par describe).
 * Chaque test référence le ou les AC de docs/specs/scene-runtime-engine.md.
 */

import { test, expect } from 'bun:test';
import { resolveTransition, isLayerVisible, toCssEasing } from './scene-resolve.js';
import { DEFAULT_TRANSITION } from './protocol.js';

// ─── resolveTransition (AC-15→18) ────────────────────────────────────────────

test('T01 [AC-18] override et sceneDefault absents → DEFAULT_TRANSITION exact', () => {
  expect(resolveTransition(undefined, undefined)).toEqual(DEFAULT_TRANSITION);
});

test('T02 [AC-18] override et sceneDefault null → DEFAULT_TRANSITION exact', () => {
  expect(resolveTransition(null, null)).toEqual(DEFAULT_TRANSITION);
});

test('T03 [AC-15] retourne toujours type/duration/easing définis (jamais undefined)', () => {
  const inputs = [
    [undefined, undefined],
    [{}, {}],
    [{ type: 'cut' }, undefined],
    [{ duration: 100 }, { type: 'cut' }],
    ['garbage', 42],
  ];
  for (const [override, sceneDefault] of inputs) {
    const r = resolveTransition(override, sceneDefault);
    expect(typeof r.type).toBe('string');
    expect(typeof r.duration).toBe('number');
    expect(typeof r.easing).toBe('string');
  }
});

test('T04 [AC-16] priorité champ par champ : override > sceneDefault > défaut', () => {
  const override = { type: 'cut', duration: 1000, easing: 'linear' };
  const sceneDefault = { type: 'crossfade', duration: 200, easing: 'easeIn' };
  expect(resolveTransition(override, sceneDefault)).toEqual({ type: 'cut', duration: 1000, easing: 'linear' });
});

test('T05 [AC-16] sceneDefault remplit quand override absent', () => {
  const sceneDefault = { type: 'cut', duration: 700, easing: 'easeOut' };
  expect(resolveTransition(undefined, sceneDefault)).toEqual({ type: 'cut', duration: 700, easing: 'easeOut' });
});

test('T06 [AC-16] override partiel : seul le champ fourni écrase, le reste vient de sceneDefault', () => {
  const sceneDefault = { type: 'cut', duration: 700, easing: 'easeOut' };
  expect(resolveTransition({ duration: 250 }, sceneDefault)).toEqual({ type: 'cut', duration: 250, easing: 'easeOut' });
});

test('T07 [AC-17] override.type invalide → ignoré, repli sur sceneDefault', () => {
  const r = resolveTransition({ type: 'zoom' }, { type: 'cut', duration: 700, easing: 'easeOut' });
  expect(r.type).toBe('cut');
});

test('T08 [AC-17] override.duration non-number → ignoré, repli sur priorité inférieure', () => {
  expect(resolveTransition({ duration: 'fast' }, undefined).duration).toBe(DEFAULT_TRANSITION.duration);
});

test('T09 [AC-17] override.duration < 0 → ignoré', () => {
  expect(resolveTransition({ duration: -50 }, { duration: 300 }).duration).toBe(300);
});

test('T10 [AC-17] override.easing hors domaine → ignoré, repli', () => {
  expect(resolveTransition({ easing: 'bounce' }, undefined).easing).toBe(DEFAULT_TRANSITION.easing);
});

test('T11 [AC-17] duration = 0 (borne min) → acceptée', () => {
  expect(resolveTransition({ duration: 0 }, undefined).duration).toBe(0);
});

test('T12 [AC-17] champs invalides dans sceneDefault ignorés, override valide appliqué', () => {
  const r = resolveTransition({ type: 'cut' }, { type: 'wipe', duration: -1, easing: 'nope' });
  expect(r).toEqual({ type: 'cut', duration: DEFAULT_TRANSITION.duration, easing: DEFAULT_TRANSITION.easing });
});

test('T13 [AC-15] ne mute pas DEFAULT_TRANSITION et retourne un nouvel objet', () => {
  const before = { ...DEFAULT_TRANSITION };
  const r = resolveTransition({ type: 'cut', duration: 9999, easing: 'linear' }, undefined);
  expect(r).not.toBe(DEFAULT_TRANSITION);
  expect(DEFAULT_TRANSITION).toEqual(before);
});

test('T13b [AC-01] les 5 valeurs de TransitionType sont acceptées', () => {
  for (const type of ['crossfade', 'cut', 'slide', 'wipe', 'morph']) {
    expect(resolveTransition({ type }, undefined).type).toBe(type);
  }
});

test('T13c [AC-01] type hors des 5 valeurs → rejeté, repli sur défaut', () => {
  expect(resolveTransition({ type: 'zoom' }, undefined).type).toBe(DEFAULT_TRANSITION.type);
});

// ─── direction / color (AC-07, AC-08) ─────────────────────────────────────────

test('T13d [AC-07] slide/wipe sans direction → repli sur "right"', () => {
  expect(resolveTransition({ type: 'slide' }, undefined).direction).toBe('right');
  expect(resolveTransition({ type: 'wipe' }, undefined).direction).toBe('right');
});

test('T13e [AC-07] direction hors des 4 valeurs valides → repli sur "right"', () => {
  expect(resolveTransition({ type: 'slide', direction: 'diagonal' }, undefined).direction).toBe('right');
});

test('T13f [AC-07] direction valide propagée telle quelle', () => {
  for (const direction of ['left', 'right', 'up', 'down']) {
    expect(resolveTransition({ type: 'slide', direction }, undefined).direction).toBe(direction);
  }
});

test('T13g [AC-07] crossfade/cut n\'imposent pas de direction', () => {
  expect(resolveTransition({ type: 'crossfade' }, undefined).direction).toBeUndefined();
  expect(resolveTransition({ type: 'cut' }, undefined).direction).toBeUndefined();
});

test('T13h [AC-08] wipe sans color → repli sur var(--color-gold)', () => {
  expect(resolveTransition({ type: 'wipe' }, undefined).color).toBe('var(--color-gold)');
});

test('T13i [AC-08] wipe avec color invalide (non-chaîne) → repli', () => {
  expect(resolveTransition({ type: 'wipe', color: 42 }, undefined).color).toBe('var(--color-gold)');
});

test('T13j [AC-08] wipe avec color valide propagée telle quelle', () => {
  expect(resolveTransition({ type: 'wipe', color: '#ff0000' }, undefined).color).toBe('#ff0000');
});

// ─── toCssEasing (AC-37) ──────────────────────────────────────────────────────

test('T14 [AC-37] chaque TransitionEasing → timing-function CSS correspondante', () => {
  expect(toCssEasing('easeInOut')).toBe('ease-in-out');
  expect(toCssEasing('easeIn')).toBe('ease-in');
  expect(toCssEasing('easeOut')).toBe('ease-out');
  expect(toCssEasing('linear')).toBe('linear');
});

test('T15 [AC-37] valeur hors domaine → ease-in-out (repli)', () => {
  for (const bad of ['bounce', '', 'ease-in', 42, null, undefined, {}]) {
    expect(toCssEasing(bad)).toBe('ease-in-out');
  }
});

// ─── isLayerVisible (AC-29) ───────────────────────────────────────────────────

test('T20 [AC-29] niveau à true → true', () => {
  expect(isLayerVisible({ full: true, minimal: true, hidden: false }, 'minimal')).toBe(true);
});

test('T21 [AC-29] niveau à false → false', () => {
  expect(isLayerVisible({ full: true, minimal: false, hidden: false }, 'hidden')).toBe(false);
});

test('T22 [AC-29] équivalence stricte visibility[level] === true sur toutes les combinaisons', () => {
  const visibilities = [
    { full: false, minimal: false, hidden: false },
    { full: true, minimal: false, hidden: false },
    { full: true, minimal: true, hidden: false },
    { full: true, minimal: true, hidden: true },
  ];
  for (const v of visibilities) {
    for (const level of /** @type {const} */ (['full', 'minimal', 'hidden'])) {
      expect(isLayerVisible(v, level)).toBe(v[level] === true);
    }
  }
});
