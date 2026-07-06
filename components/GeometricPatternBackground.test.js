/**
 * GeometricPatternBackground.test.js — Tests de `patternStyle` (pure, Track B session B5).
 * Lancement : `bun test`
 */

import { test, expect } from 'bun:test';
import { patternStyle } from './GeometricPatternBackground.js';

test('T01 [Track B] patternStyle diamonds — 4 dégradés linéaires, backgroundColor = colorB', () => {
  const style = patternStyle('diamonds', '#C8B97A', '#0b0b0c', 100);
  expect(style.backgroundImage).toContain('linear-gradient');
  expect(style.backgroundSize).toBe('100px 100px');
  expect(style.backgroundColor).toBe('#0b0b0c');
});

test('T02 [Track B] patternStyle dots — dégradés radiaux concentriques', () => {
  const style = patternStyle('dots', '#C8B97A', '#0b0b0c', 60);
  expect(style.backgroundImage).toContain('radial-gradient');
  expect(style.backgroundSize).toBe('60px 60px');
});

test('T03 [Track B] patternStyle angled — conic-gradient + repeating-linear-gradient', () => {
  const style = patternStyle('angled', '#C8B97A', '#0b0b0c', 80);
  expect(style.backgroundImage).toContain('conic-gradient');
  expect(style.backgroundImage).toContain('repeating-linear-gradient');
  expect(style.backgroundSize).toBe('80px 240px');
});

test('T04 [Track B] patternStyle eyes — deux dégradés radiaux décalés (backgroundPosition défini)', () => {
  const style = patternStyle('eyes', '#C8B97A', '#0b0b0c', 100);
  expect(style.backgroundImage.split(',').length).toBeGreaterThanOrEqual(2);
  expect(style.backgroundPosition).toBe('0 0, 50px 50px');
});

test('T05 [Track B] pattern inconnu → repli sur diamonds (comportement de la clause default)', () => {
  const fallback = patternStyle(/** @type {*} */ ('inconnu'), '#C8B97A', '#0b0b0c', 100);
  const diamonds = patternStyle('diamonds', '#C8B97A', '#0b0b0c', 100);
  expect(fallback).toEqual(diamonds);
});
