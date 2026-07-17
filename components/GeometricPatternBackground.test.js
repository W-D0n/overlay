/**
 * GeometricPatternBackground.test.js — Tests de `patternStyle` (pure, Track B session B5).
 * Lancement : `bun test`
 */

import { test, expect } from 'bun:test';
import { movementKeyframes, patternStyle } from './GeometricPatternBackground.js';

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

test('T03 [Track B] patternStyle chevrons — deux diagonales orientables', () => {
  const style = patternStyle('chevrons', '#C8B97A', '#0b0b0c', 80, 30);
  expect(style.backgroundImage).toContain('linear-gradient(30deg');
  expect(style.backgroundImage).toContain('linear-gradient(-30deg');
  expect(style.backgroundSize).toBe('80px 40px');
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

test('movementKeyframes applique axe et signe de la direction', () => {
  expect(movementKeyframes('left', 100)).toEqual([
    { backgroundPositionX: '0px' },
    { backgroundPositionX: '-100px' },
  ]);
  expect(movementKeyframes('down', 80)).toEqual([
    { backgroundPositionY: '0px' },
    { backgroundPositionY: '80px' },
  ]);
});

test('movementKeyframes conserve la variation de teinte du motif dots', () => {
  const frames = movementKeyframes('right', 60, true);
  expect(frames[0].filter).toBe('hue-rotate(0deg)');
  expect(frames[1].filter).toBe('hue-rotate(360deg)');
});
