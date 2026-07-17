import { describe, expect, test } from 'bun:test';
import {
  appendBackgroundColor,
  backgroundColorsFieldValues,
  backgroundFieldValues,
} from './background-field-renderer.js';

describe('rendu des champs de fond', () => {
  test('prépare chaque champ avec la valeur courante ou son défaut', () => {
    const values = backgroundFieldValues('RainBackground', {
      intensity: 0.8,
      color: 'var(--color-gold)',
    });

    expect(values.map(({ field, value }) => [field.key, value])).toEqual([
      ['intensity', 0.8],
      ['speed', 1],
      ['color', 'var(--color-gold)'],
      ['angle', 8],
    ]);
  });

  test('un fond absent ne produit aucun champ', () => {
    expect(backgroundFieldValues(null, {})).toEqual([]);
  });

  test('une palette vide et le bouton d’ajout utilisent toujours l’or Atelier', () => {
    expect(backgroundColorsFieldValues([])).toEqual(['var(--color-gold)']);
    expect(appendBackgroundColor(['#123456'])).toEqual(['#123456', 'var(--color-gold)']);
  });
});
