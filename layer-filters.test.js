import { describe, expect, test } from 'bun:test';
import { ADJUSTMENTS, DEFAULT_GLOW, GLOW_LIMITS, canonicalFilters, filterCss, filterErrors, setAdjustment, setGlow } from './layer-filters.js';

describe('validation', () => {
  const errors = (filters) => filterErrors('f', filters);

  test('absent, vide ou bien formé : valide', () => {
    expect(errors(undefined)).toEqual([]);
    expect(errors({})).toEqual([]);
    expect(errors({ brightness: 1.5, contrast: 0, saturation: 3, hue: -180, glow: { color: '#C8B97A', size: 16, intensity: 0.8 } })).toEqual([]);
  });

  test('chaque défaut est signalé avec son chemin', () => {
    expect(errors('x')).toEqual(['f : objet attendu']);
    expect(errors([])).toEqual(['f : objet attendu']);
    expect(errors({ brightness: 'x' })).toEqual(['f.brightness : nombre attendu']);
    expect(errors({ brightness: 2.1 })).toEqual(['f.brightness : entre 0 et 2 attendu']);
    expect(errors({ contrast: -0.1 })).toEqual(['f.contrast : entre 0 et 2 attendu']);
    expect(errors({ saturation: 3.1 })).toEqual(['f.saturation : entre 0 et 3 attendu']);
    expect(errors({ hue: 181 })).toEqual(['f.hue : entre -180 et 180 attendu']);
    expect(errors({ hue: Number.NaN })).toEqual(['f.hue : nombre attendu']);
    expect(errors({ glow: 'x' })).toEqual(['f.glow : objet attendu']);
    expect(errors({ glow: { color: 'rouge', size: 10, intensity: 0.5 } })).toEqual(['f.glow.color : couleur #rrggbb attendue']);
    expect(errors({ glow: { color: '#fff', size: 10, intensity: 0.5 } })).toEqual(['f.glow.color : couleur #rrggbb attendue']);
    expect(errors({ glow: { color: '#ffffff', size: 61, intensity: 0.5 } })).toEqual(['f.glow.size : entre 0 et 60 attendu']);
    expect(errors({ glow: { color: '#ffffff', size: 10, intensity: 1.5 } })).toEqual(['f.glow.intensity : entre 0 et 1 attendu']);
    expect(errors({ glow: { color: '#ffffff' } })).toEqual(['f.glow.size : nombre attendu', 'f.glow.intensity : nombre attendu']);
  });

  test('les bornes déclarées sont acceptées', () => {
    for (const [key, { min, max }] of Object.entries(ADJUSTMENTS)) {
      expect(errors({ [key]: min })).toEqual([]);
      expect(errors({ [key]: max })).toEqual([]);
    }
    expect(errors({ glow: { color: '#000000', size: GLOW_LIMITS.size.max, intensity: GLOW_LIMITS.intensity.max } })).toEqual([]);
  });
});

describe('forme canonique', () => {
  test('une valeur neutre n\'est pas écrite, un objet vide non plus', () => {
    expect(canonicalFilters({ brightness: 1, contrast: 1, saturation: 1, hue: 0 })).toBeUndefined();
    expect(canonicalFilters({})).toBeUndefined();
    expect(canonicalFilters({ brightness: 1, hue: 30 })).toEqual({ hue: 30 });
  });

  test('les valeurs sont bornées et arrondies au centième', () => {
    expect(canonicalFilters({ brightness: 9, contrast: -4, saturation: 1.23456, hue: 400 })).toEqual({ brightness: 2, contrast: 0, saturation: 1.23, hue: 180 });
    expect(canonicalFilters({ brightness: 1.001 })).toBeUndefined();
  });

  test('une valeur à peine hors de la valeur neutre mais arrondie à elle est retirée', () => {
    expect(canonicalFilters({ contrast: 0.9999 })).toBeUndefined();
    expect(canonicalFilters({ hue: 0.004 })).toBeUndefined();
  });

  test('le halo : couleur en minuscules, portée au dixième, intensité au centième, bornés', () => {
    expect(canonicalFilters({ glow: { color: '#C8B97A', size: 16.04, intensity: 0.8049 } })).toEqual({ glow: { color: '#c8b97a', size: 16, intensity: 0.8 } });
    expect(canonicalFilters({ glow: { color: '#000000', size: 99, intensity: 5 } })).toEqual({ glow: { color: '#000000', size: 60, intensity: 1 } });
  });

  test('un halo sans effet est retiré : portée nulle ou intensité nulle', () => {
    expect(canonicalFilters({ glow: { color: '#ffffff', size: 0, intensity: 0.8 } })).toBeUndefined();
    expect(canonicalFilters({ glow: { color: '#ffffff', size: 12, intensity: 0 } })).toBeUndefined();
    expect(canonicalFilters({ glow: { color: '#ffffff', size: 0.04, intensity: 0.8 } })).toBeUndefined();
    expect(canonicalFilters({ hue: 20, glow: { color: '#ffffff', size: 0, intensity: 0.8 } })).toEqual({ hue: 20 });
  });

  test('ce qui n\'est pas un filtre valide reste tel quel, pour que la validation le refuse', () => {
    expect(canonicalFilters('x')).toBe('x');
    expect(canonicalFilters(undefined)).toBeUndefined();
    expect(canonicalFilters({ brightness: 'x' })).toEqual({ brightness: 'x' });
    expect(canonicalFilters({ glow: 'x' })).toEqual({ glow: 'x' });
    expect(canonicalFilters({ glow: { color: 'rouge', size: 10, intensity: 0.5 } })).toEqual({ glow: { color: 'rouge', size: 10, intensity: 0.5 } });
    expect(canonicalFilters({ glow: { color: 12, size: 10, intensity: 0.5 } })).toEqual({ glow: { color: 12, size: 10, intensity: 0.5 } });
  });

  test('canonique : refaire le travail ne change rien', () => {
    const once = canonicalFilters({ brightness: 1.2345, glow: { color: '#ABCDEF', size: 9.99, intensity: 0.555 } });
    expect(canonicalFilters(once)).toEqual(once);
  });
});

describe('édition', () => {
  test('régler un réglage de couleur garde les autres filtres', () => {
    const base = { contrast: 1.2, glow: { color: '#c8b97a', size: 10, intensity: 0.5 } };
    expect(setAdjustment(base, 'hue', 45)).toEqual({ ...base, hue: 45 });
    expect(setAdjustment(base, 'contrast', 1.5)).toEqual({ ...base, contrast: 1.5 });
  });

  test('la valeur neutre ou « aucune » retire le réglage, et le dernier retiré retire les filtres', () => {
    expect(setAdjustment({ contrast: 1.2 }, 'contrast', 1)).toBeUndefined();
    expect(setAdjustment({ contrast: 1.2 }, 'contrast', null)).toBeUndefined();
    expect(setAdjustment({ contrast: 1.2, hue: 10 }, 'contrast', null)).toEqual({ hue: 10 });
    expect(setAdjustment(undefined, 'hue', 0)).toBeUndefined();
  });

  test('le halo : allumer part du halo de départ, un morceau complète celui qui existe', () => {
    expect(setGlow(undefined, {})).toEqual({ glow: { color: '#c8b97a', size: 16, intensity: 0.8 } });
    expect(setGlow(undefined, { size: 30 })).toEqual({ glow: { color: '#c8b97a', size: 30, intensity: 0.8 } });
    const lit = setGlow({ hue: 10 }, { color: '#112233' });
    expect(lit).toEqual({ hue: 10, glow: { color: '#112233', size: 16, intensity: 0.8 } });
    expect(setGlow(lit, { intensity: 0.3 })).toEqual({ hue: 10, glow: { color: '#112233', size: 16, intensity: 0.3 } });
  });

  test('éteindre le halo (null, portée ou intensité nulle) le retire ; le rallumer repart du halo de départ', () => {
    const lit = { glow: { color: '#112233', size: 16, intensity: 0.8 } };
    expect(setGlow(lit, null)).toBeUndefined();
    expect(setGlow({ hue: 5, ...lit }, null)).toEqual({ hue: 5 });
    expect(setGlow(lit, { size: 0 })).toBeUndefined();
    expect(setGlow(lit, { intensity: 0 })).toBeUndefined();
    expect(setGlow(setGlow(lit, { size: 0 }), { size: 20 })).toEqual({ glow: { color: '#c8b97a', size: 20, intensity: 0.8 } });
  });

  test('les filtres reçus ne sont pas modifiés', () => {
    const base = { contrast: 1.2, glow: { color: '#c8b97a', size: 10, intensity: 0.5 } };
    const before = JSON.stringify(base);
    setAdjustment(base, 'hue', 10);
    setGlow(base, { size: 40 });
    setGlow(base, null);
    expect(JSON.stringify(base)).toBe(before);
    expect(DEFAULT_GLOW).toEqual({ color: '#C8B97A', size: 16, intensity: 0.8 });
  });
});

describe('filterCss', () => {
  test('rien à rendre : chaîne vide', () => {
    expect(filterCss(undefined)).toBe('');
    expect(filterCss({})).toBe('');
  });

  test('les réglages de couleur, dans l\'ordre luminosité, contraste, saturation, teinte', () => {
    expect(filterCss({ hue: -30, saturation: 1.5, contrast: 0.8, brightness: 1.2 })).toBe('brightness(1.2) contrast(0.8) saturate(1.5) hue-rotate(-30deg)');
    expect(filterCss({ saturation: 0 })).toBe('saturate(0)');
  });

  test('le halo : une ombre sans décalage, portée en pixels de la source de référence, couleur en rgba', () => {
    expect(filterCss({ glow: { color: '#c8b97a', size: 16, intensity: 0.8 } })).toBe('drop-shadow(0 0 calc(var(--reference-scale, 1) * 16px) rgba(200, 185, 122, 0.8))');
    expect(filterCss({ glow: { color: '#ff0000', size: 4.5, intensity: 1 } })).toBe('drop-shadow(0 0 calc(var(--reference-scale, 1) * 4.5px) rgba(255, 0, 0, 1))');
  });

  test('le halo vient après les réglages de couleur : il garde la couleur choisie', () => {
    const css = filterCss({ glow: { color: '#000000', size: 8, intensity: 0.5 }, hue: 90, brightness: 1.1 });
    expect(css.startsWith('brightness(1.1) hue-rotate(90deg) drop-shadow(')).toBe(true);
  });
});
