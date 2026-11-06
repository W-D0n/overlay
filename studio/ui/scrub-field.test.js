import { describe, expect, test } from 'bun:test';
import { scrubValue, speedFactor } from './scrub-field.js';

describe('scrubValue', () => {
  test('avance par pas entiers du champ, bornée', () => {
    expect(scrubValue(10, 3, { step: 1 })).toBe(13);
    expect(scrubValue(10, -25, { step: 1, min: 0 })).toBe(0);
    expect(scrubValue(95, 20, { step: 1, max: 100 })).toBe(100);
  });

  test('un glissement fractionnaire ne bouge qu’au pas entier suivant', () => {
    expect(scrubValue(10, 0.9, { step: 1 })).toBe(10);
    expect(scrubValue(10, 1.9, { step: 1 })).toBe(11);
    expect(scrubValue(10, -1.9, { step: 1 })).toBe(9);
  });

  test('pas décimal : pas de bruit de virgule flottante', () => {
    expect(scrubValue(0.1, 2, { step: 0.1 })).toBe(0.3);
    expect(scrubValue(0, 3, { step: 0.5 })).toBe(1.5);
    expect(scrubValue(1.1, 1, { step: 0.05 })).toBe(1.15);
  });

  test('vitesse : Maj ×10, Alt ×0,1, arrondi à la précision utile', () => {
    expect(speedFactor({ shiftKey: true, altKey: false })).toBe(10);
    expect(speedFactor({ shiftKey: false, altKey: true })).toBe(0.1);
    expect(speedFactor({ shiftKey: false, altKey: false })).toBe(1);
    expect(scrubValue(50, 2, { step: 1, factor: 10 })).toBe(70);
    expect(scrubValue(50, 3, { step: 1, factor: 0.1 })).toBe(50.3);
  });

  test('un pas invalide retombe sur 1', () => {
    expect(scrubValue(5, 2, { step: 0 })).toBe(7);
    expect(scrubValue(5, 2, { step: Number.NaN })).toBe(7);
  });
});
