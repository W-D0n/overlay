import { describe, expect, test } from 'bun:test';
import { createLayer } from '../scene-doc.js';
import { describeKey, formatSeconds, percentOf, timeFromPointer, timelineOf, valueAt } from './timeline-view.js';

describe('temps', () => {
  test('formatSeconds : secondes avec virgule', () => {
    expect(formatSeconds(0)).toBe('0,00 s');
    expect(formatSeconds(1250)).toBe('1,25 s');
    expect(formatSeconds(60_000)).toBe('60,00 s');
    expect(formatSeconds(1230.4)).toBe('1,23 s');
  });

  test('percentOf : borné entre 0 et 100, sans diviser par zéro', () => {
    expect(percentOf(1000, 4000)).toBe(25);
    expect(percentOf(-5, 4000)).toBe(0);
    expect(percentOf(9000, 4000)).toBe(100);
    expect(percentOf(10, 0)).toBe(0);
  });

  test('timeFromPointer : l’instant sous le pointeur, arrondi au pas et borné à la durée', () => {
    const lane = { left: 100, width: 400 };
    expect(timeFromPointer(100, lane, 4000)).toBe(0);
    expect(timeFromPointer(300, lane, 4000)).toBe(2000);
    expect(timeFromPointer(302, lane, 4000)).toBe(2020);
    expect(timeFromPointer(50, lane, 4000)).toBe(0);
    expect(timeFromPointer(900, lane, 4000)).toBe(4000);
    expect(timeFromPointer(300, { left: 0, width: 0 }, 4000)).toBe(0);
  });
});

describe('valeurs', () => {
  const layer = createLayer({ id: 'a', kind: 'text', opacity: 0.8, rotation: 12, blur: 3, timeline: [{ target: 'opacity', keys: [{ t: 0, v: 0, ease: 'linear' }, { t: 1000, v: 1, ease: 'linear' }] }] });

  test('valueAt : la valeur de la piste au repère, sinon la valeur de base de la couche', () => {
    expect(valueAt(layer, 'opacity', 500)).toBe(0.5);
    expect(valueAt(layer, 'rotation', 500)).toBe(12);
    expect(valueAt(layer, 'blur', 500)).toBe(3);
    expect(valueAt(layer, 'scale', 500)).toBe(1);
    expect(valueAt(layer, 'x', 500)).toBe(0);
    expect(valueAt(createLayer({ id: 'b', kind: 'text', opacity: 0.4 }), 'opacity', 0)).toBe(0.4);
  });

  test('describeKey : une phrase pour un lecteur d’écran, avec l’unité', () => {
    expect(describeKey('rotation', { t: 1500, v: 30, ease: 'linear' })).toBe('Image clé rotation à 1,50 s, valeur 30 °');
    expect(describeKey('opacity', { t: 0, v: 1, ease: 'linear' })).toBe('Image clé opacité à 0,00 s, valeur 1');
  });

  test('timelineOf : la timeline de la scène ou celle par défaut', () => {
    expect(timelineOf({ version: 1, id: 's', name: 'S', layers: [] })).toEqual({ durationMs: 4000, loop: 'once' });
    expect(timelineOf({ version: 1, id: 's', name: 'S', timeline: { durationMs: 2000, loop: 'loop' }, layers: [] })).toEqual({ durationMs: 2000, loop: 'loop' });
  });
});
