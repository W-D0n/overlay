import { describe, expect, test } from 'bun:test';
import { BEZIER_LIMITS, BEZIER_PRESETS, DEFAULT_BEZIER, bezierErrors, clampBezier, cubicBezier, isBezier } from './cubic-bezier.js';

/** Un oracle sans résolution d'équation : on balaie finement le paramètre de la courbe et on interpole l'ordonnée à l'abscisse voulue. */
function oracle([x1, y1, x2, y2], x) {
  const point = (u) => {
    const v = 1 - u;
    return [3 * v * v * u * x1 + 3 * v * u * u * x2 + u ** 3, 3 * v * v * u * y1 + 3 * v * u * u * y2 + u ** 3];
  };
  let previous = point(0);
  for (let step = 1; step <= 200_000; step += 1) {
    const current = point(step / 200_000);
    if (current[0] >= x) {
      const span = current[0] - previous[0];
      return span === 0 ? current[1] : previous[1] + ((current[1] - previous[1]) * (x - previous[0])) / span;
    }
    previous = current;
  }
  return 1;
}

const xs = Array.from({ length: 21 }, (_, at) => at / 20);

describe('cubicBezier', () => {
  test('0 au départ, 1 à l\'arrivée, et rien au-delà (comme en CSS)', () => {
    for (const { bezier } of BEZIER_PRESETS) {
      expect(cubicBezier(bezier, 0)).toBe(0);
      expect(cubicBezier(bezier, 1)).toBe(1);
      expect(cubicBezier(bezier, -0.5)).toBe(0);
      expect(cubicBezier(bezier, 3)).toBe(1);
    }
  });

  test('la courbe (0, 0, 1, 1) est la ligne droite', () => {
    for (const x of xs) expect(cubicBezier([0, 0, 1, 1], x)).toBeCloseTo(x, 5);
  });

  test('d\'accord avec un calcul indépendant, sur les préréglages et des courbes quelconques', () => {
    const curves = [...BEZIER_PRESETS.map(({ bezier }) => bezier), [0, 0, 0, 1], [1, 0, 1, 1], [0, 1, 1, 0], [0.9, -1.5, 0.1, 2.5], [0.5, 0.5, 0.5, 0.5]];
    for (const curve of curves) {
      for (const x of xs) expect(Math.abs(cubicBezier(curve, x) - oracle(curve, x))).toBeLessThan(2e-4);
    }
  });

  test('une valeur connue : la courbe « ease » de CSS vaut environ 0,802 à mi-parcours', () => {
    expect(cubicBezier(DEFAULT_BEZIER, 0.5)).toBeCloseTo(0.8024, 3);
  });

  test('l\'abscisse est le temps : avec des abscisses dans 0 à 1 la courbe ne revient jamais en arrière dans le temps (continuité)', () => {
    for (const { bezier } of BEZIER_PRESETS) {
      let previous = 0;
      for (let step = 1; step <= 100; step += 1) {
        const value = cubicBezier(bezier, step / 100);
        expect(Math.abs(value - previous)).toBeLessThan(0.2);
        previous = value;
      }
    }
  });

  test('un rebond dépasse 1, une anticipation passe sous 0, une courbe douce reste entre les deux', () => {
    const range = (id) => {
      const values = xs.map((x) => cubicBezier(/** @type {*} */ (BEZIER_PRESETS.find((preset) => preset.id === id)).bezier, x));
      return [Math.min(...values), Math.max(...values)];
    };
    expect(range('overshoot')[1]).toBeGreaterThan(1.05);
    expect(range('anticipation')[0]).toBeLessThan(-0.05);
    expect(range('swing')[0]).toBeLessThan(0);
    expect(range('swing')[1]).toBeGreaterThan(1);
    expect(range('soft')[0]).toBeGreaterThanOrEqual(0);
    expect(range('soft')[1]).toBeLessThanOrEqual(1);
  });

  test('une courbe à pente nulle au départ (0, 0, 0, 1) se résout aussi, sans boucler', () => {
    for (const x of xs) expect(Math.abs(cubicBezier([0, 0, 0, 1], x) - oracle([0, 0, 0, 1], x))).toBeLessThan(2e-4);
  });
});

describe('forme, bornes et validation', () => {
  test('isBezier : quatre nombres finis', () => {
    expect(isBezier([0.1, 0.2, 0.3, 0.4])).toBe(true);
    for (const bad of [undefined, null, 'x', [], [1, 2, 3], [1, 2, 3, 4, 5], [1, 2, 3, NaN], [1, 2, 3, Infinity], [1, 2, 3, '4'], { 0: 1, length: 4 }]) expect(isBezier(bad)).toBe(false);
  });

  test('bezierErrors : refuse ce qui n\'est pas quatre nombres, puis chaque point hors de ses bornes, avec son rang', () => {
    expect(bezierErrors('k.bezier', [0.25, 0.1, 0.25, 1])).toEqual([]);
    expect(bezierErrors('k.bezier', [0, BEZIER_LIMITS.y.min, 1, BEZIER_LIMITS.y.max])).toEqual([]);
    expect(bezierErrors('k.bezier', undefined)).toEqual(['k.bezier : quatre nombres attendus (x1, y1, x2, y2)']);
    expect(bezierErrors('k.bezier', [1, 2, 3])).toEqual(['k.bezier : quatre nombres attendus (x1, y1, x2, y2)']);
    expect(bezierErrors('k.bezier', [-0.1, 0, 1, 0])[0]).toContain('k.bezier[0]');
    expect(bezierErrors('k.bezier', [0, 5, 1, 0])[0]).toContain('k.bezier[1]');
    expect(bezierErrors('k.bezier', [0, 0, 1.1, 0])[0]).toContain('k.bezier[2]');
    expect(bezierErrors('k.bezier', [0, 0, 1, -3])[0]).toContain('k.bezier[3]');
    expect(bezierErrors('k.bezier', [-1, 9, 2, -9]).length).toBe(4);
  });

  test('clampBezier : dans les bornes, arrondi au millième, sans modifier l\'original', () => {
    const original = [-1, 9, 2, -9];
    expect(clampBezier(/** @type {*} */ (original))).toEqual([0, BEZIER_LIMITS.y.max, 1, BEZIER_LIMITS.y.min]);
    expect(original).toEqual([-1, 9, 2, -9]);
    expect(clampBezier([0.12345, 0.98765, 0.5004, 0.5006])).toEqual([0.123, 0.988, 0.5, 0.501]);
  });

  test('les préréglages sont des courbes valides, aux identifiants et libellés uniques', () => {
    expect(BEZIER_PRESETS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(BEZIER_PRESETS.map(({ id }) => id)).size).toBe(BEZIER_PRESETS.length);
    expect(new Set(BEZIER_PRESETS.map(({ label }) => label)).size).toBe(BEZIER_PRESETS.length);
    for (const { bezier } of BEZIER_PRESETS) expect(bezierErrors('p', bezier)).toEqual([]);
    expect(bezierErrors('d', DEFAULT_BEZIER)).toEqual([]);
  });
});
