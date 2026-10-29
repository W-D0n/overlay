// @ts-check
import { describe, expect, test } from 'bun:test';
import { GRID_MODES, LAYER_KINDS, LAYER_KIND_IDS, isAudioOn, isLayerKindId } from './layer-kinds.js';
import { MODE_PARAMS } from './components/DotGridAnimated.js';

describe('valeur persistée de la réactivité audio', () => {
  test('le booléen est la forme canonique ; l’ancien libellé « Oui » reste lu', () => {
    expect(isAudioOn(true)).toBe(true);
    expect(isAudioOn('Oui')).toBe(true);
  });

  test('tout le reste est inactif : false, « Non », absent, valeurs aberrantes', () => {
    for (const value of [false, 'Non', undefined, null, 0, 1, '', 'oui', 'true']) {
      expect(isAudioOn(value)).toBe(false);
    }
  });
});

describe('description des types de couche', () => {
  test('chaque effet décrit son champ audioReactive comme un booléen désactivé par défaut', () => {
    for (const id of LAYER_KIND_IDS) {
      const field = LAYER_KINDS[id].fields.find(({ key }) => key === 'audioReactive');
      expect(field?.type).toBe('boolean');
      expect(field?.default).toBe(false);
    }
  });

  test('les modes DotGrid décrits sont exactement ceux que l’effet connaît', () => {
    expect([...GRID_MODES].sort()).toEqual(Object.keys(MODE_PARAMS).sort());
  });

  test('isLayerKindId ne reconnaît que les identifiants décrits', () => {
    expect(isLayerKindId('RainBackground')).toBe(true);
    expect(isLayerKindId('MatrixGridBackground')).toBe(false);
    expect(isLayerKindId('toString')).toBe(false);
    expect(isLayerKindId(null)).toBe(false);
  });
});
