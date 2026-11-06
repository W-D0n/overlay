import { beforeAll, describe, expect, test } from 'bun:test';
import { TRACE_FILL_FROM, TRACE_STROKE_PART, pathLength, shapePath, traceParts } from './shape-geometry.js';
import { createLayerHarness } from './layer-test-harness.js';

beforeAll(() => {
  globalThis.document ??= /** @type {any} */ ({ createElement: () => ({ style: {}, remove() {} }), body: { appendChild() {} }, documentElement: {} });
  globalThis.getComputedStyle = (/** @type {any} */ node) => ({ color: node.style?.cssText?.match(/color:([^;]+)/)?.[1] ?? '', getPropertyValue: () => '' });
});

describe('pathLength : la longueur du contour', () => {
  test('rectangle : le périmètre, moins ce que les coins arrondis raccourcissent', () => {
    expect(pathLength({ type: 'rect', x: 0, y: 0, width: 300, height: 100, radius: 0 })).toBe(800);
    // Un rayon r remplace 2 côtés de 2r par un quart de cercle de longueur πr/2 : -(8 - 2π) r au total.
    expect(pathLength({ type: 'rect', x: 0, y: 0, width: 300, height: 100, radius: 10 })).toBeCloseTo(800 - (8 - 2 * Math.PI) * 10, 9);
    expect(pathLength({ type: 'rect', x: 0, y: 0, width: 100, height: 100, radius: 50 })).toBeCloseTo(2 * Math.PI * 50, 9);
  });

  test('ellipse : un cercle donne 2πr, une ellipse aplatie reste proche de la valeur connue', () => {
    expect(pathLength({ type: 'ellipse', cx: 0, cy: 0, rx: 50, ry: 50 })).toBeCloseTo(2 * Math.PI * 50, 9);
    // Périmètre d'une ellipse de demi-axes 5 et 3 : 25,5270… (valeur de référence).
    expect(pathLength({ type: 'ellipse', cx: 0, cy: 0, rx: 5, ry: 3 })).toBeCloseTo(25.5270, 2);
  });

  test('polygone : la somme des côtés, fermeture comprise ; ligne : sa longueur', () => {
    expect(pathLength({ type: 'polygon', points: [[0, 0], [3, 0], [3, 4]] })).toBe(12);
    expect(pathLength({ type: 'line', x1: 0, y1: 0, x2: 30, y2: 40 })).toBe(50);
  });
});

describe('traceParts : ce que montre une présence', () => {
  test('rien à 0, tout à 1', () => {
    expect(traceParts(0)).toEqual({ stroke: 0, fill: 0 });
    expect(traceParts(1)).toEqual({ stroke: 1, fill: 1 });
  });

  test('le contour se trace d\'abord, le remplissage apparaît ensuite', () => {
    expect(traceParts(TRACE_STROKE_PART / 2).stroke).toBeCloseTo(0.5, 9);
    expect(traceParts(TRACE_FILL_FROM).fill).toBe(0);
    expect(traceParts(TRACE_FILL_FROM).stroke).toBeGreaterThan(0);
    expect(traceParts((TRACE_FILL_FROM + 1) / 2).fill).toBeCloseTo(0.5, 9);
    expect(traceParts(TRACE_STROKE_PART).stroke).toBe(1);
  });

  test('toujours entre 0 et 1, et croissant avec la présence', () => {
    let previous = { stroke: 0, fill: 0 };
    for (let step = 0; step <= 40; step += 1) {
      const parts = traceParts(step / 40);
      expect(parts.stroke).toBeGreaterThanOrEqual(previous.stroke);
      expect(parts.fill).toBeGreaterThanOrEqual(previous.fill);
      expect(parts.stroke).toBeLessThanOrEqual(1);
      expect(parts.fill).toBeLessThanOrEqual(1);
      previous = parts;
    }
  });
});

async function mounted(options) {
  const { ShapeLayer } = await import('./ShapeLayer.js');
  const harness = createLayerHarness();
  return { harness, instance: ShapeLayer(options, harness.environment) };
}
const shape = (over = {}) => ({ shape: 'rectangle', fill: 'solid', strokeWidth: 10, cornerRadius: 0, ...over });
const dashes = (calls) => calls.filter(([kind]) => kind === 'setLineDash').map(([, dash]) => dash);
const alphas = (calls) => calls.filter(([kind, name]) => kind === 'set' && name === 'globalAlpha').map(([, , value]) => value);
const total = pathLength(/** @type {*} */ (shapePath({ shape: 'rectangle', width: 1920, height: 1080, strokeWidth: 10, cornerRadius: 0 })));

describe('ShapeLayer : le tracé du contour', () => {
  test('une part du contour est tracée et le remplissage est encore transparent', async () => {
    const { harness, instance } = await mounted(shape());
    harness.tick(16);
    instance.animate({ kind: 'shape', presence: 0.35 });
    const calls = harness.tick(32);
    expect(dashes(calls)[0][0]).toBeCloseTo(total * 0.5, 6);
    expect(dashes(calls)[0][1]).toBeCloseTo(total, 6);
    expect(alphas(calls)).toEqual([0]);
    expect(calls.filter(([kind]) => kind === 'save').length).toBe(1);
    expect(calls.filter(([kind]) => kind === 'restore').length).toBe(1);
  });

  test('le contour est tracé en pointillé puis le pointillé est retiré', async () => {
    const { harness, instance } = await mounted(shape());
    harness.tick(16);
    instance.animate({ kind: 'shape', presence: 0.5 });
    const calls = harness.tick(32);
    expect(dashes(calls).at(-1)).toEqual([]);
    expect(calls.filter(([kind]) => kind === 'stroke').length).toBe(1);
  });

  test('plus loin, le contour est entier et le remplissage apparaît en fondu', async () => {
    const { harness, instance } = await mounted(shape());
    harness.tick(16);
    instance.animate({ kind: 'shape', presence: 0.85 });
    const calls = harness.tick(32);
    expect(dashes(calls)[0][0]).toBeCloseTo(total, 6);
    expect(alphas(calls)[0]).toBeCloseTo(0.7, 9);
  });

  test('sans remplissage, seul le contour se trace ; sans contour, seul le remplissage apparaît', async () => {
    const outline = await mounted(shape({ fill: 'none' }));
    outline.harness.tick(16);
    outline.instance.animate({ kind: 'shape', presence: 0.35 });
    const outlined = outline.harness.tick(32);
    expect(alphas(outlined)).toEqual([]);
    expect(dashes(outlined).length).toBeGreaterThan(0);
    const filled = await mounted(shape({ strokeWidth: 0 }));
    filled.harness.tick(16);
    filled.instance.animate({ kind: 'shape', presence: 0.75 });
    const fill = filled.harness.tick(32);
    expect(dashes(fill)).toEqual([]);
    expect(alphas(fill)[0]).toBeCloseTo(0.5, 9);
  });

  test('une ligne se trace aussi, sur sa longueur', async () => {
    const { harness, instance } = await mounted({ shape: 'line', strokeWidth: 6 });
    harness.tick(16);
    instance.animate({ kind: 'shape', presence: 0.35 });
    const calls = harness.tick(32);
    expect(dashes(calls)[0][0]).toBeCloseTo(1920 * 0.5, 6);
    expect(dashes(calls).at(-1)).toEqual([]);
  });

  test('la présence pleine redessine la forme d\'un seul trait, null aussi', async () => {
    const { harness, instance } = await mounted(shape());
    harness.tick(16);
    instance.animate({ kind: 'shape', presence: 0.4 });
    harness.tick(32);
    instance.animate({ kind: 'shape', presence: 1 });
    const whole = harness.tick(48);
    expect(dashes(whole)).toEqual([]);
    expect(whole.filter(([kind]) => kind === 'fill').length).toBe(1);
    instance.animate({ kind: 'shape', presence: 0.4 });
    harness.tick(64);
    instance.animate(null);
    expect(dashes(harness.tick(80))).toEqual([]);
  });

  test('le même état ne redessine pas ; un état de texte est ignoré', async () => {
    const { harness, instance } = await mounted(shape());
    harness.tick(16);
    instance.animate({ kind: 'shape', presence: 0.4 });
    expect(harness.tick(32).length).toBeGreaterThan(0);
    instance.animate({ kind: 'shape', presence: 0.4 });
    expect(harness.tick(48)).toEqual([]);
    instance.animate({ kind: 'text', unit: 'chars', reveal: 'hard', presence: 0.4 });
    expect(dashes(harness.tick(64))).toEqual([]);
  });

  test('sans animation, le dessin est exactement celui d\'avant : ni pointillé, ni transparence', async () => {
    const { harness } = await mounted(shape());
    const calls = harness.tick(16);
    expect(dashes(calls)).toEqual([]);
    expect(alphas(calls)).toEqual([]);
    expect(calls.filter(([kind]) => kind === 'save')).toEqual([]);
  });
});
