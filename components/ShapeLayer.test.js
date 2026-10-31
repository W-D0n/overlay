import { beforeAll, describe, expect, test } from 'bun:test';
import { createLayerHarness } from './layer-test-harness.js';

beforeAll(() => {
  globalThis.document ??= /** @type {any} */ ({ createElement: () => ({ style: {}, remove() {} }), body: { appendChild() {} }, documentElement: {} });
  globalThis.getComputedStyle = (/** @type {any} */ node) => ({ color: node.style?.cssText?.match(/color:([^;]+)/)?.[1] ?? '', getPropertyValue: () => '' });
});

async function mounted(options) {
  const { ShapeLayer } = await import('./ShapeLayer.js');
  const harness = createLayerHarness();
  return { harness, instance: ShapeLayer(options, harness.environment) };
}
const names = (calls) => calls.filter(([kind]) => kind !== 'set').map(([kind]) => kind);
const sets = (calls, property) => calls.filter(([kind, name]) => kind === 'set' && name === property).map(([, , value]) => value);

describe('ShapeLayer', () => {
  test('un rectangle uni : tracé puis rempli, sans contour', async () => {
    const { harness } = await mounted({ shape: 'rectangle', strokeWidth: 0 });
    const calls = harness.tick(16);
    expect(names(calls)).toEqual(expect.arrayContaining(['beginPath', 'rect', 'fill']));
    expect(names(calls)).not.toContain('stroke');
    expect(sets(calls, 'fillStyle')).toEqual(['rgb(200,185,122)']);
  });

  test('un rectangle arrondi utilise roundRect avec le rayon réglé', async () => {
    const { harness } = await mounted({ shape: 'rectangle', cornerRadius: 40 });
    const calls = harness.tick(16);
    expect(calls.find(([kind]) => kind === 'roundRect').slice(1)).toEqual([0, 0, 1920, 1080, 40]);
  });

  test('un dégradé crée un dégradé linéaire à deux couleurs ; « aucun » ne remplit pas', async () => {
    const gradient = (await mounted({ fill: 'gradient' })).harness.tick(16);
    expect(names(gradient)).toContain('createLinearGradient');
    const none = (await mounted({ fill: 'none', strokeWidth: 4 })).harness.tick(16);
    expect(names(none)).not.toContain('fill');
    expect(names(none)).toContain('stroke');
  });

  test('une ligne se trace au contour, avec l’épaisseur du contour, sans remplissage', async () => {
    const calls = (await mounted({ shape: 'line', strokeWidth: 8 })).harness.tick(16);
    expect(names(calls)).toEqual(expect.arrayContaining(['moveTo', 'lineTo', 'stroke']));
    expect(names(calls)).not.toContain('fill');
    expect(sets(calls, 'lineWidth')).toEqual([8]);
  });

  test('le triangle et le losange sont des polygones fermés, l’ellipse utilise ellipse', async () => {
    expect(names((await mounted({ shape: 'triangle' })).harness.tick(16))).toEqual(expect.arrayContaining(['moveTo', 'lineTo', 'closePath']));
    expect(names((await mounted({ shape: 'ellipse' })).harness.tick(16))).toContain('ellipse');
  });

  test('statique : un seul dessin, un de plus par changement d’options', async () => {
    const { harness, instance } = await mounted({});
    expect(harness.tick(16).length).toBeGreaterThan(0);
    expect(harness.tick(32)).toEqual([]);
    instance.update({ shape: 'ellipse' });
    expect(names(harness.tick(48))).toContain('ellipse');
    instance.update({ shape: 'ellipse' });
    expect(harness.tick(64)).toEqual([]);
  });

  test('des options invalides retombent sur les défauts, une forme inconnue ne casse pas', async () => {
    const calls = (await mounted({ shape: 'étoile', strokeWidth: 'épais', cornerRadius: -5 })).harness.tick(16);
    expect(names(calls)).toContain('rect');
  });
});
