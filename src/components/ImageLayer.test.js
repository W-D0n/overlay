import { beforeAll, describe, expect, test } from 'bun:test';
import { createAssetImageLoader } from './asset-image.js';
import { createLayerHarness } from './layer-test-harness.js';

const ID = 'a'.repeat(32);
const OTHER = 'b'.repeat(32);

beforeAll(() => {
  globalThis.document ??= /** @type {any} */ ({ createElement: () => ({ style: {}, remove() {} }), body: { appendChild() {} }, documentElement: {} });
  globalThis.getComputedStyle = (/** @type {any} */ node) => ({ color: node.style?.cssText?.match(/color:([^;]+)/)?.[1] ?? '', getPropertyValue: () => '' });
});

/** Un chargeur dont on décide quand chaque image arrive. */
function manualLoader() {
  const pending = new Map();
  return {
    load: (id) => new Promise((resolve, reject) => pending.set(id, { resolve, reject })),
    arrive: (id, width = 400, height = 200) => pending.get(id).resolve({ naturalWidth: width, naturalHeight: height }),
    fail: (id) => pending.get(id).reject(new Error('introuvable')),
  };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const names = (calls) => calls.filter(([kind]) => kind !== 'set').map(([kind]) => kind);

async function mounted(options, loader = manualLoader()) {
  const { createImageLayer } = await import('./ImageLayer.js');
  const warnings = [];
  const harness = createLayerHarness();
  const instance = createImageLayer({ loader, warn: (message) => warnings.push(message) })(options, harness.environment);
  return { harness, instance, loader, warnings };
}

describe('ImageLayer', () => {
  test('ne dessine rien tant que l’image n’est pas arrivée, puis la dessine une fois', async () => {
    const { harness, loader } = await mounted({ asset: ID, fit: 'contain' });
    expect(names(harness.tick(16))).not.toContain('drawImage');
    loader.arrive(ID, 400, 200);
    await flush();
    const calls = harness.tick(32);
    const draw = calls.find(([kind]) => kind === 'drawImage');
    expect(draw.slice(2)).toEqual([0, 0, 400, 200, 0, 60, 1920, 960]);
    expect(harness.tick(48)).toEqual([]);
  });

  test('sans image choisie, rien n’est demandé ni dessiné', async () => {
    const asked = [];
    const { harness } = await mounted({ asset: '' }, { load: (id) => { asked.push(id); return new Promise(() => {}); } });
    expect(names(harness.tick(16))).not.toContain('drawImage');
    expect(asked).toEqual([]);
  });

  test('pendant qu’une autre image se charge, la précédente reste affichée ; elle est remplacée à l’arrivée de la nouvelle', async () => {
    const { harness, instance, loader } = await mounted({ asset: ID });
    loader.arrive(ID);
    await flush();
    harness.tick(16);
    instance.update({ asset: OTHER });
    // Rien n'est redessiné ni effacé : le canvas garde l'ancienne image, et un redimensionnement la redessinerait encore.
    expect(harness.tick(32)).toEqual([]);
    loader.arrive(OTHER, 100, 100);
    await flush();
    const draw = harness.tick(48).find(([kind]) => kind === 'drawImage');
    expect(draw.slice(4, 6)).toEqual([100, 100]);
  });

  test('une image qui arrive après qu’on en a demandé une autre est ignorée', async () => {
    const { harness, instance, loader } = await mounted({ asset: ID });
    instance.update({ asset: OTHER });
    loader.arrive(OTHER, 100, 100);
    await flush();
    loader.arrive(ID, 999, 999);
    await flush();
    const draws = harness.tick(16).filter(([kind]) => kind === 'drawImage');
    expect(draws.length).toBe(1);
    expect(draws[0].slice(4, 6)).toEqual([100, 100]);
  });

  test('une image introuvable n’affiche rien (jamais l’ancienne), avec un avertissement', async () => {
    const { harness, instance, loader, warnings } = await mounted({ asset: ID });
    loader.arrive(ID);
    await flush();
    harness.tick(16);
    instance.update({ asset: OTHER });
    loader.fail(OTHER);
    await flush();
    expect(names(harness.tick(32))).not.toContain('drawImage');
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain(OTHER);
  });

  test('retirer l’image efface la couche', async () => {
    const { harness, instance, loader } = await mounted({ asset: ID });
    loader.arrive(ID);
    await flush();
    harness.tick(16);
    instance.update({ asset: '' });
    expect(names(harness.tick(32))).not.toContain('drawImage');
  });

  test('changer seulement le cadrage redessine sans recharger l’image', async () => {
    const asked = [];
    const loader = { load: (id) => { asked.push(id); return Promise.resolve({ naturalWidth: 400, naturalHeight: 200 }); } };
    const { harness, instance } = await mounted({ asset: ID, fit: 'contain' }, loader);
    await flush();
    harness.tick(16);
    instance.update({ asset: ID, fit: 'cover' });
    const draw = harness.tick(32).find(([kind]) => kind === 'drawImage');
    const [sx, sy, sw, sh] = draw.slice(2, 6);
    expect(sx).toBeCloseTo((400 - 200 * (1920 / 1080)) / 2, 6);
    expect([sy, sh]).toEqual([0, 200]);
    expect(sw / sh).toBeCloseTo(1920 / 1080, 6);
    expect(asked).toEqual([ID]);
  });

  test('des coins arrondis découpent l’image ; un contour est tracé autour de l’image affichée, dans la zone', async () => {
    const { harness, loader } = await mounted({ asset: ID, fit: 'fill', cornerRadius: 40, strokeWidth: 10 });
    loader.arrive(ID);
    await flush();
    const calls = harness.tick(16);
    const kinds = names(calls);
    expect(kinds).toContain('clip');
    expect(kinds.indexOf('clip')).toBeLessThan(kinds.indexOf('drawImage'));
    expect(kinds).toContain('stroke');
    const draw = calls.find(([kind]) => kind === 'drawImage');
    expect(draw.slice(6)).toEqual([5, 5, 1910, 1070]);
  });

  test('l’ombre d’une image sans coins arrondis est celle de l’image elle-même', async () => {
    const { harness, loader } = await mounted({ asset: ID, shadowBlur: 12 });
    loader.arrive(ID);
    await flush();
    const calls = harness.tick(16);
    const shadowIndex = calls.findIndex(([kind, name, value]) => kind === 'set' && name === 'shadowBlur' && value === 12);
    expect(shadowIndex).toBeGreaterThan(-1);
    expect(shadowIndex).toBeLessThan(calls.findIndex(([kind]) => kind === 'drawImage'));
  });
});

describe('createAssetImageLoader', () => {
  /** Une classe Image factice : le test décide quand elle charge ou échoue. */
  function fakeImages() {
    const created = [];
    class FakeImage {
      constructor() { created.push(this); }
    }
    return { FakeImage, created };
  }

  test('une même image n’est demandée qu’une fois, même demandée plusieurs fois à la fois', async () => {
    const { FakeImage, created } = fakeImages();
    const loader = createAssetImageLoader({ ImageImpl: FakeImage, urlOf: (id) => `http://x/${id}` });
    const first = loader.load(ID);
    const second = loader.load(ID);
    expect(created.length).toBe(1);
    expect(created[0].src).toBe(`http://x/${ID}`);
    expect(created[0].crossOrigin).toBe('anonymous');
    created[0].onload();
    expect(await first).toBe(await second);
    expect(loader.load(ID)).toBe(first);
  });

  test('un échec n’est pas retenu : la demande suivante réessaie', async () => {
    const { FakeImage, created } = fakeImages();
    const loader = createAssetImageLoader({ ImageImpl: FakeImage, urlOf: (id) => id });
    const failing = loader.load(ID);
    created[0].onerror();
    await expect(failing).rejects.toThrow(ID);
    const retry = loader.load(ID);
    expect(created.length).toBe(2);
    created[1].onload();
    expect(await retry).toBe(created[1]);
  });

  test('le cache est borné : les plus anciennes images sont oubliées', () => {
    const { FakeImage, created } = fakeImages();
    const loader = createAssetImageLoader({ ImageImpl: FakeImage, urlOf: (id) => id });
    for (let index = 0; index < 30; index += 1) loader.load(String(index).padStart(32, '0'));
    expect(created.length).toBe(30);
    loader.load('0'.repeat(32));
    expect(created.length).toBe(31);
    loader.load('29'.padStart(32, '0'));
    expect(created.length).toBe(31);
  });
});
