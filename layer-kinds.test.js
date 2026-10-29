// @ts-check
import { describe, expect, test } from 'bun:test';
import { GRID_MODES, LAYER_KINDS, LAYER_KIND_IDS, isAudioOn, isLayerKindId, isKnownKindId, resolveKindId } from './layer-kinds.js';
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
    expect(isLayerKindId('rain')).toBe(true);
    expect(isLayerKindId('MatrixGridBackground')).toBe(false);
    expect(isLayerKindId('toString')).toBe(false);
    expect(isLayerKindId(null)).toBe(false);
  });
});

describe('identifiants neutres et anciens noms', () => {
  const LEGACY = {
    DotGridBackground: 'dotgrid', RainBackground: 'rain', BubbleBackground: 'bubble',
    FirefliesBackground: 'fireflies', FloatingSymbolsBackground: 'floating-symbols',
    GeometricPatternBackground: 'geometric-pattern', ColorDropsBackground: 'color-drops',
    StarsParallaxBackground: 'stars-parallax', OrbitingShapesBackground: 'orbiting-shapes',
    ShapeMorphBackground: 'shape-morph', WaterRippleBackground: 'water-ripple',
  };

  test('chaque ancien nom se résout vers son identifiant neutre, qui se résout vers lui-même', () => {
    for (const [legacy, id] of Object.entries(LEGACY)) {
      expect(resolveKindId(legacy)).toBe(id);
      expect(resolveKindId(id)).toBe(id);
    }
    expect([...LAYER_KIND_IDS].sort()).toEqual(Object.values(LEGACY).sort());
  });

  test('un nom inconnu ne se résout pas ; isKnownKindId accepte l’ancien et le nouveau nom', () => {
    expect(resolveKindId('MatrixGridBackground')).toBeNull();
    expect(resolveKindId(undefined)).toBeNull();
    expect(resolveKindId('toString')).toBeNull();
    expect(isKnownKindId('RainBackground')).toBe(true);
    expect(isKnownKindId('rain')).toBe(true);
    expect(isLayerKindId('RainBackground')).toBe(false);
  });

  test('les libellés affichés ne changent pas avec les identifiants', () => {
    expect(LAYER_KINDS.rain.label).toBe('Rain');
    expect(LAYER_KINDS['floating-symbols'].label).toBe('FloatingSymbols');
  });
});
