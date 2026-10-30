import { describe, expect, test } from 'bun:test';
import { RENDER_REFERENCE } from '../render-reference.js';
import {
  PLACEMENT_PRESETS, alignPlacements, applyPlacementChange, boundingBox, distributePlacements, fromDisplay, matchingPreset, toDisplay,
} from './placement-math.js';

const P = (x, y, width, height) => ({ x, y, width, height });

describe('unités', () => {
  test('pourcentage : deux décimales ; pixels : la résolution de référence, entiers', () => {
    expect(toDisplay('x', 0.12345, 'percent')).toBe(12.35);
    expect(toDisplay('width', 0.5, 'pixel')).toBe(RENDER_REFERENCE.width / 2);
    expect(toDisplay('height', 0.5, 'pixel')).toBe(RENDER_REFERENCE.height / 2);
    expect(toDisplay('y', 1 / 3, 'pixel')).toBe(360);
  });

  test('l’aller-retour saisie → fraction → affichage rend la saisie', () => {
    for (const unit of ['percent', 'pixel']) {
      for (const key of ['x', 'y', 'width', 'height']) {
        const typed = unit === 'percent' ? 37.5 : 640;
        expect(toDisplay(key, fromDisplay(key, typed, unit), unit)).toBe(typed);
      }
    }
  });
});

describe('proportions', () => {
  test('sans verrou, une seule clé change', () => {
    expect(applyPlacementChange(P(0, 0, 0.5, 0.5), 'width', 0.25)).toEqual({ width: 0.25 });
    expect(applyPlacementChange(P(0, 0, 0.5, 0.5), 'x', 0.1, { lockRatio: true })).toEqual({ x: 0.1 });
  });

  test('avec verrou, le rapport en pixels est conservé (16:9 reste 16:9, malgré des fractions égales)', () => {
    const patch = applyPlacementChange(P(0, 0, 0.5, 0.5), 'width', 0.25, { lockRatio: true });
    expect(patch).toEqual({ width: 0.25, height: 0.25 });
    const ratio = (p) => (p.width * RENDER_REFERENCE.width) / (p.height * RENDER_REFERENCE.height);
    const square = applyPlacementChange(P(0, 0, 0.5625, 1), 'height', 0.5, { lockRatio: true });
    expect(ratio({ ...P(0, 0, 0.5625, 1), ...square })).toBeCloseTo(ratio(P(0, 0, 0.5625, 1)), 9);
    expect(square.width).toBeCloseTo(0.28125, 9);
  });

  test('un placement dégénéré ne produit ni NaN ni division par zéro', () => {
    const patch = applyPlacementChange(P(0, 0, 0, 0.5), 'height', 0.3, { lockRatio: true });
    expect(patch).toEqual({ height: 0.3 });
  });
});

describe('alignement', () => {
  const layers = { a: P(0.1, 0.1, 0.2, 0.2), b: P(0.5, 0.4, 0.3, 0.1) };

  test('sur la toile : bords et centres', () => {
    expect(alignPlacements(layers, 'left', 'canvas')).toEqual({ a: { x: 0 }, b: { x: 0 } });
    expect(alignPlacements(layers, 'right', 'canvas')).toEqual({ a: { x: 0.8 }, b: { x: 0.7 } });
    expect(alignPlacements(layers, 'top', 'canvas')).toEqual({ a: { y: 0 }, b: { y: 0 } });
    const centered = alignPlacements(layers, 'hcenter', 'canvas');
    expect(centered.a.x).toBeCloseTo(0.4, 9);
    expect(centered.b.x).toBeCloseTo(0.35, 9);
    const middle = alignPlacements(layers, 'vcenter', 'canvas');
    expect(middle.a.y).toBeCloseTo(0.4, 9);
    expect(middle.b.y).toBeCloseTo(0.45, 9);
    expect(alignPlacements(layers, 'bottom', 'canvas').b.y).toBeCloseTo(0.9, 9);
  });

  test('sur la sélection : la boîte englobante sert de repère', () => {
    const box = boundingBox(Object.values(layers));
    expect([box.x, box.y, box.width, box.height].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0.1, 0.1, 0.7, 0.4]);
    expect(alignPlacements(layers, 'left', 'selection')).toEqual({ b: { x: 0.1 } });
    const bottom = alignPlacements(layers, 'bottom', 'selection');
    expect(bottom.a.y).toBeCloseTo(0.3, 9);
    expect(bottom.b).toBeUndefined();
  });

  test('une couche déjà alignée ne figure pas dans le résultat ; rien à aligner : vide', () => {
    expect(alignPlacements({ a: P(0, 0.2, 0.3, 0.3) }, 'left', 'canvas')).toEqual({});
    expect(alignPlacements({}, 'left', 'canvas')).toEqual({});
  });

  test('les tailles ne changent jamais', () => {
    for (const mode of ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom']) {
      for (const patch of Object.values(alignPlacements(layers, mode, 'canvas'))) {
        expect(Object.keys(patch)).not.toContain('width');
        expect(Object.keys(patch)).not.toContain('height');
      }
    }
  });
});

describe('répartition', () => {
  test('trois couches : écarts égaux entre la première et la dernière, tailles inchangées', () => {
    const patches = distributePlacements({ a: P(0, 0, 0.1, 0.1), b: P(0.15, 0, 0.2, 0.1), c: P(0.9, 0, 0.1, 0.1) }, 'horizontal');
    expect(patches.a).toBeUndefined();
    expect(patches.c).toBeUndefined();
    // espace libre = 1 - (0.1 + 0.2 + 0.1) = 0.6, soit 0.3 d'écart ; b démarre à 0.1 + 0.3
    expect(patches.b.x).toBeCloseTo(0.4, 9);
  });

  test('l’ordre est celui de la position, pas celui des identifiants', () => {
    const patches = distributePlacements({ z: P(0, 0, 0.1, 0.1), a: P(0.9, 0, 0.1, 0.1), m: P(0.2, 0, 0.1, 0.1) }, 'horizontal');
    expect(patches.m.x).toBeCloseTo(0.45, 9);
  });

  test('verticalement ; moins de trois couches : rien', () => {
    const patches = distributePlacements({ a: P(0, 0, 0.1, 0.2), b: P(0, 0.1, 0.1, 0.2), c: P(0, 0.8, 0.1, 0.2) }, 'vertical');
    expect(patches.b.y).toBeCloseTo(0.4, 9);
    expect(distributePlacements({ a: P(0, 0, 0.1, 0.1), b: P(0.5, 0, 0.1, 0.1) }, 'horizontal')).toEqual({});
  });
});

describe('positions prédéfinies', () => {
  test('toutes tiennent dans la toile et ont une taille', () => {
    for (const { placement } of PLACEMENT_PRESETS) {
      expect(placement.width).toBeGreaterThan(0);
      expect(placement.height).toBeGreaterThan(0);
      expect(placement.x).toBeGreaterThanOrEqual(0);
      expect(placement.y).toBeGreaterThanOrEqual(0);
      expect(placement.x + placement.width).toBeLessThanOrEqual(1 + 1e-9);
      expect(placement.y + placement.height).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  test('identifiants uniques ; les incrustations gardent le 16:9', () => {
    expect(new Set(PLACEMENT_PRESETS.map(({ id }) => id)).size).toBe(PLACEMENT_PRESETS.length);
    for (const id of ['pip-br', 'pip-bl']) {
      const { placement } = PLACEMENT_PRESETS.find((preset) => preset.id === id);
      expect((placement.width * RENDER_REFERENCE.width) / (placement.height * RENDER_REFERENCE.height)).toBeCloseTo(16 / 9, 6);
    }
  });

  test('matchingPreset reconnaît une position exacte, pas une position proche', () => {
    expect(matchingPreset(P(0, 0, 1, 1))).toBe('full');
    expect(matchingPreset(P(2 / 3, 0, 1 / 3, 1))).toBe('third-right');
    expect(matchingPreset(P(0, 0, 0.99, 1))).toBeNull();
  });
});
