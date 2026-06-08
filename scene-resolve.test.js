/**
 * scene-resolve.test.js — Tests autonomes des helpers purs du runtime (S3).
 * Lancement : `bun test`
 *
 * Numérotation T## continue sur tout le fichier (jamais réinitialisée par describe).
 * Chaque test référence le ou les AC de docs/specs/scene-runtime-engine.md.
 */

import { test, expect } from 'bun:test';
import { resolveTransition, isLayerVisible, resolveDotgridMode, toCssEasing } from './scene-resolve.js';
import { DEFAULT_TRANSITION, DEFAULT_DOTGRID_MODE } from './protocol.js';
import { GRID_MODES } from './components/DotGridAnimated.js';

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
  const r = resolveTransition({ type: 'wipe' }, { type: 'cut', duration: 700, easing: 'easeOut' });
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

// ─── resolveDotgridMode (AC-25→27) ────────────────────────────────────────────

test('T16 [AC-25] null → null (scène sans DotGrid)', () => {
  expect(resolveDotgridMode(null)).toBeNull();
});

test('T17 [AC-26] chaque mode de GRID_MODES → ce mode', () => {
  for (const mode of GRID_MODES) {
    expect(resolveDotgridMode(mode)).toBe(mode);
  }
});

test('T18 [AC-27] valeur invalide non-null → DEFAULT_DOTGRID_MODE', () => {
  for (const bad of ['jeu', 'nope', '', 42, {}]) {
    expect(resolveDotgridMode(bad)).toBe(DEFAULT_DOTGRID_MODE);
  }
});

test('T19 [AC-27] undefined (non-null) → DEFAULT_DOTGRID_MODE', () => {
  expect(resolveDotgridMode(undefined)).toBe(DEFAULT_DOTGRID_MODE);
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
