import { describe, expect, test } from 'bun:test';
import { gradientLine, shapePath } from './shape-geometry.js';

const path = (over = {}) => shapePath({ shape: 'rectangle', width: 400, height: 200, strokeWidth: 0, cornerRadius: 0, ...over });

describe('shapePath', () => {
  test('un rectangle remplit la zone ; son contour est dedans, jamais rogné par le bord', () => {
    expect(path()).toEqual({ type: 'rect', x: 0, y: 0, width: 400, height: 200, radius: 0 });
    expect(path({ strokeWidth: 20 })).toEqual({ type: 'rect', x: 10, y: 10, width: 380, height: 180, radius: 0 });
  });

  test('le rayon des coins ne dépasse jamais la moitié du plus petit côté', () => {
    expect(path({ cornerRadius: 30 }).radius).toBe(30);
    expect(path({ cornerRadius: 9999 }).radius).toBe(100);
  });

  test('l’ellipse, le losange et le triangle occupent la zone', () => {
    expect(path({ shape: 'ellipse' })).toEqual({ type: 'ellipse', cx: 200, cy: 100, rx: 200, ry: 100 });
    expect(path({ shape: 'diamond' }).points).toEqual([[200, 0], [400, 100], [200, 200], [0, 100]]);
    expect(path({ shape: 'triangle' }).points).toEqual([[200, 0], [400, 200], [0, 200]]);
  });

  test('une ligne traverse la zone au milieu, sans réserve de contour', () => {
    expect(path({ shape: 'line', strokeWidth: 12 })).toEqual({ type: 'line', x1: 0, y1: 100, x2: 400, y2: 100 });
  });

  test('un contour plus épais que la zone ne laisse aucune forme', () => {
    expect(path({ strokeWidth: 400 })).toBeNull();
    expect(path({ width: 0 })).toBeNull();
  });
});

describe('gradientLine', () => {
  test('0° va de gauche à droite sur toute la largeur, 90° de haut en bas sur toute la hauteur', () => {
    expect(gradientLine(0, 400, 200)).toEqual({ x0: 0, y0: 100, x1: 400, y1: 100 });
    const down = gradientLine(90, 400, 200);
    expect(down.x0).toBeCloseTo(200, 6);
    expect(down.y0).toBeCloseTo(0, 6);
    expect(down.y1).toBeCloseTo(200, 6);
  });

  test('une diagonale couvre la zone du coin au coin opposé', () => {
    const diagonal = gradientLine(45, 200, 200);
    expect(diagonal.x0).toBeCloseTo(100 - 100 * Math.SQRT2 * Math.cos(Math.PI / 4), 6);
    expect(Math.hypot(diagonal.x1 - diagonal.x0, diagonal.y1 - diagonal.y0)).toBeCloseTo(200 * Math.SQRT2, 6);
  });
});
