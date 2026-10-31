import { beforeAll, describe, expect, test } from 'bun:test';
import { assetFontFamily, createAssetFontLoader } from './asset-font.js';
import { createLayerHarness } from './layer-test-harness.js';

const ID = 'a'.repeat(32);
const OTHER = 'b'.repeat(32);

beforeAll(() => {
  globalThis.document ??= { createElement: () => ({ style: {}, remove() {} }), body: { appendChild() {} }, documentElement: {} };
  globalThis.getComputedStyle = (node) => ({ color: node.style?.cssText?.match(/color:([^;]+)/)?.[1] ?? '', getPropertyValue: () => '' });
});

/** Une FontFace factice : le test décide quand elle charge ou échoue. */
function fakeFonts() {
  const created = [];
  const added = [];
  class FakeFace {
    constructor(family, source) { this.family = family; this.source = source; created.push(this); }
    load() { return new Promise((resolve, reject) => { this.resolve = () => resolve(this); this.reject = () => reject(new Error('introuvable')); }); }
  }
  return { FakeFace, created, added, fonts: { add: (face) => added.push(face) } };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createAssetFontLoader', () => {
  test('déclare la police sous un nom de famille propre à son identifiant, la charge, puis l’ajoute à la page', async () => {
    const { FakeFace, created, added, fonts } = fakeFonts();
    const loader = createAssetFontLoader({ FontFaceImpl: FakeFace, fonts, urlOf: (id) => `http://x/assets/${id}` });
    const pending = loader.load(ID);
    expect(created[0].family).toBe(assetFontFamily(ID));
    expect(assetFontFamily(ID)).toBe(`overlay-asset-${ID}`);
    expect(created[0].source).toBe(`url("http://x/assets/${ID}")`);
    expect(added).toEqual([]);
    await flush();
    created[0].resolve();
    expect(await pending).toBe(`overlay-asset-${ID}`);
    expect(added).toEqual([created[0]]);
  });

  test('une même police n’est demandée qu’une fois ; deux polices ne se confondent pas', async () => {
    const { FakeFace, created, fonts } = fakeFonts();
    const loader = createAssetFontLoader({ FontFaceImpl: FakeFace, fonts, urlOf: (id) => id });
    const first = loader.load(ID);
    expect(loader.load(ID)).toBe(first);
    loader.load(OTHER);
    expect(created.length).toBe(2);
    expect(new Set(created.map((face) => face.family)).size).toBe(2);
  });

  test('un échec n’est pas retenu : la demande suivante réessaie', async () => {
    const { FakeFace, created, fonts } = fakeFonts();
    const loader = createAssetFontLoader({ FontFaceImpl: FakeFace, fonts, urlOf: (id) => id });
    const failing = loader.load(ID);
    await flush();
    created[0].reject();
    await expect(failing).rejects.toThrow('introuvable');
    await flush();
    loader.load(ID);
    expect(created.length).toBe(2);
  });

  test('un navigateur sans FontFace le dit clairement', async () => {
    const loader = createAssetFontLoader({ FontFaceImpl: undefined, fonts: null });
    await expect(loader.load(ID)).rejects.toThrow('ne sait pas charger de polices');
  });
});

describe('TextLayer : police importée', () => {
  /** Un chargeur dont on décide quand la police arrive. */
  function manual() {
    const pending = new Map();
    return {
      load: (id) => new Promise((resolve, reject) => pending.set(id, { resolve, reject })),
      arrive: (id) => pending.get(id).resolve(assetFontFamily(id)),
      fail: (id) => pending.get(id).reject(new Error('introuvable')),
    };
  }
  async function mounted(options, fonts = manual()) {
    const { createTextLayer } = await import('./TextLayer.js');
    const warnings = [];
    const harness = createLayerHarness();
    const instance = createTextLayer({ fonts, warn: (message) => warnings.push(message) })(options, harness.environment);
    return { harness, instance, fonts, warnings };
  }
  const usedFont = (calls) => calls.filter(([kind, name]) => kind === 'set' && name === 'font').map(([, , value]) => value).at(-1);

  test('tant que la police n’est pas arrivée, le texte est dans sa famille de repli ; à son arrivée il se redessine avec elle, en tête de pile', async () => {
    const { harness, fonts } = await mounted({ text: ['A'], fontAsset: ID, font: 'sans' });
    expect(usedFont(harness.tick(16))).not.toContain('overlay-asset');
    fonts.arrive(ID);
    await flush();
    expect(usedFont(harness.tick(32))).toMatch(new RegExp(`700 96px "overlay-asset-${ID}", `));
  });

  test('la police importée passe avant la police installée demandée', async () => {
    const { harness, fonts } = await mounted({ text: ['A'], fontAsset: ID, fontFamily: 'Bebas Neue' });
    fonts.arrive(ID);
    await flush();
    expect(usedFont(harness.tick(16))).toMatch(new RegExp(`"overlay-asset-${ID}", "Bebas Neue", `));
  });

  test('sans police importée, rien n’est demandé', async () => {
    const asked = [];
    const { harness } = await mounted({ text: ['A'] }, { load: (id) => { asked.push(id); return new Promise(() => {}); } });
    harness.tick(16);
    expect(asked).toEqual([]);
  });

  test('pendant qu’une autre police se charge, l’ancienne reste ; une police introuvable est signalée et le texte retombe sur sa famille', async () => {
    const { harness, instance, fonts, warnings } = await mounted({ text: ['A'], fontAsset: ID });
    fonts.arrive(ID);
    await flush();
    harness.tick(16);
    instance.update({ text: ['A'], fontAsset: OTHER });
    expect(usedFont(harness.tick(32))).toContain(ID);
    fonts.fail(OTHER);
    await flush();
    expect(usedFont(harness.tick(48))).not.toContain('overlay-asset');
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain(OTHER);
  });

  test('une police qui arrive après qu’on en a demandé une autre est ignorée', async () => {
    const { harness, instance, fonts } = await mounted({ text: ['A'], fontAsset: ID });
    instance.update({ text: ['A'], fontAsset: OTHER });
    fonts.arrive(OTHER);
    await flush();
    fonts.arrive(ID);
    await flush();
    const used = usedFont(harness.tick(16));
    expect(used).toContain(OTHER);
    expect(used).not.toContain(`overlay-asset-${ID}`);
  });

  test('retirer la police importée rend le texte à sa famille', async () => {
    const { harness, instance, fonts } = await mounted({ text: ['A'], fontAsset: ID });
    fonts.arrive(ID);
    await flush();
    harness.tick(16);
    instance.update({ text: ['A'], fontAsset: '' });
    expect(usedFont(harness.tick(32))).not.toContain('overlay-asset');
  });
});
