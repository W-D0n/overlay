// @ts-check
import { describe, expect, test } from 'bun:test';
import { EFFECT_KIND_IDS, GRID_MODES, LAYER_KINDS, LAYER_KIND_IDS, isAudioOn, isIdentityKind, isLayerKindId, isKnownKindId, resolveKindId, validateOptions, clampOptions } from './layer-kinds.js';
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
    for (const id of EFFECT_KIND_IDS) {
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

describe('couche d’identité : le branding', () => {
  test('c’est un type de couche connu, mais pas un effet de fond', () => {
    expect(isLayerKindId('branding')).toBe(true);
    expect(LAYER_KIND_IDS).toContain('branding');
    expect(EFFECT_KIND_IDS).not.toContain('branding');
    expect(EFFECT_KIND_IDS.length).toBe(LAYER_KIND_IDS.length - 1);
  });

  test('seul le branding est une couche d’identité ; un type inconnu n’en est pas une', () => {
    expect(isIdentityKind('branding')).toBe(true);
    for (const id of EFFECT_KIND_IDS) expect(isIdentityKind(id)).toBe(false);
    expect(isIdentityKind('inconnu')).toBe(false);
    expect(isIdentityKind(undefined)).toBe(false);
  });

  test('il n’a ni micro, ni réaction native, ni réglage propre (son contenu est global)', () => {
    expect(LAYER_KINDS.branding.capabilities).toEqual({ audio: false, reactions: 'overlay' });
    expect(LAYER_KINDS.branding.fields).toEqual([]);
    expect(validateOptions('branding', {})).toEqual([]);
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
    expect([...EFFECT_KIND_IDS].sort()).toEqual(Object.values(LEGACY).sort());
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

describe('validation des valeurs d’options', () => {
  test('des valeurs conformes au schéma sont acceptées, y compris un champ absent', () => {
    expect(validateOptions('rain', { speed: 1.5, color: '#fff', audioReactive: true })).toEqual([]);
    expect(validateOptions('rain', {})).toEqual([]);
  });

  test('un type invalide est rejeté avec le nom du champ', () => {
    expect(validateOptions('rain', { speed: 'abc' })).toEqual(['speed : nombre attendu']);
    expect(validateOptions('rain', { speed: Number.NaN })).toEqual(['speed : nombre attendu']);
    expect(validateOptions('rain', { audioReactive: 'peut-être' })).toEqual(['audioReactive : booléen attendu']);
    expect(validateOptions('rain', { color: 12 })).toEqual(['color : texte attendu']);
    expect(validateOptions('color-drops', { colors: 'rouge' })).toEqual(['colors : liste de textes attendue']);
    expect(validateOptions('dotgrid', { mode: 3 })).toEqual(['mode : texte attendu']);
  });

  test('plusieurs erreurs sont toutes rapportées', () => {
    expect(validateOptions('rain', { speed: 'a', angle: 'b' })).toHaveLength(2);
  });

  test('un champ inconnu est conservé et n’est pas une erreur (preset plus récent que le code)', () => {
    expect(validateOptions('rain', { futur: [1, 2] })).toEqual([]);
    expect(clampOptions('rain', { futur: [1, 2], speed: 1 })).toEqual({ futur: [1, 2], speed: 1 });
  });

  test('un nombre hors bornes est ramené dans les bornes du schéma, jamais rejeté', () => {
    expect(clampOptions('bubble', { count: 9999, speed: -3 })).toEqual({ count: 200, speed: 0 });
    expect(clampOptions('rain', { speed: 2 })).toEqual({ speed: 2 });
  });

  test('clampOptions ne touche ni aux types invalides ni à l’objet reçu', () => {
    const input = { speed: 'abc', count: 9999 };
    expect(clampOptions('bubble', input)).toEqual({ speed: 'abc', count: 200 });
    expect(input.count).toBe(9999);
  });

  test('un type de couche inconnu n’est ni validé ni modifié', () => {
    expect(validateOptions('fantome', { x: 1 })).toEqual([]);
    expect(clampOptions('fantome', { x: 1 })).toEqual({ x: 1 });
  });
});
