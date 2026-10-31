import { describe, expect, test } from 'bun:test';
import { MAX_BUNDLE_ASSETS, base64ToBytes, bytesToBase64, packAssets, referencedAssetIds, unpackAssets } from './bundle-assets.js';
import { createBackgroundPresetBundle, parseBackgroundPresetBundle } from './background-preset-library.js';
import { pngBytes } from './test-images.js';

const ID = 'a'.repeat(32);
const OTHER = 'b'.repeat(32);
const packed = (over = {}) => ({ id: ID, name: 'affiche.png', type: 'png', data: bytesToBase64(pngBytes(10, 10)), ...over });

describe('base64', () => {
  test('aller-retour exact, y compris au-delà d’un morceau de 32 Ko et pour tous les octets', () => {
    const big = Uint8Array.from({ length: 3_000_000 }, (_, index) => index % 256);
    expect([...base64ToBytes(bytesToBase64(big))]).toEqual([...big]);
    expect(bytesToBase64(new Uint8Array())).toBe('');
    expect(base64ToBytes('').length).toBe(0);
  });

  test('un texte qui n’est pas du base64 lève', () => {
    expect(() => base64ToBytes('%%% pas du base64 %%%')).toThrow();
  });
});

describe('referencedAssetIds', () => {
  test('les images des presets plats et des scènes, sans doublon', () => {
    const presets = [{ id: 'p', component: 'image', options: { asset: ID } }];
    const scenes = [{ layers: [{ options: { asset: ID } }, { options: { asset: OTHER } }, { options: { text: ['x'] } }] }];
    expect(referencedAssetIds(presets, scenes).sort()).toEqual([ID, OTHER]);
    expect(referencedAssetIds([], [])).toEqual([]);
  });
});

describe('packAssets / unpackAssets', () => {
  test('ce qu’on emballe se relit à l’identique', () => {
    const bytes = pngBytes(640, 360);
    const [entry] = packAssets([{ meta: { id: ID, name: 'a.png', type: 'png' }, bytes }]);
    expect(entry).toEqual({ id: ID, name: 'a.png', type: 'png', data: bytesToBase64(bytes) });
    const unpacked = unpackAssets([entry]);
    expect(unpacked.ok).toBe(true);
    expect(unpacked.assets[0]).toMatchObject({ id: ID, name: 'a.png', type: 'png' });
    expect([...unpacked.assets[0].bytes]).toEqual([...bytes]);
  });

  test('l’absence d’images est valide : un lot sans « assets » n’en a aucune', () => {
    expect(unpackAssets(undefined)).toEqual({ ok: true, assets: [] });
    expect(unpackAssets([])).toEqual({ ok: true, assets: [] });
  });

  test('refuse ce qui n’est pas un tableau, trop d’images, un identifiant invalide, un doublon', () => {
    expect(unpackAssets('non').ok).toBe(false);
    expect(unpackAssets(new Array(MAX_BUNDLE_ASSETS + 1).fill(packed()))).toMatchObject({ ok: false });
    expect(unpackAssets([packed({ id: '../x' })]).errors[0]).toContain('assets[0].id');
    expect(unpackAssets([packed(), packed()]).errors[0]).toContain('en double');
    expect(unpackAssets([null]).errors[0]).toContain('objet attendu');
  });

  test('refuse un contenu absent, illisible, ou qui n’est pas une image (le type vient des octets, pas de la déclaration)', () => {
    expect(unpackAssets([packed({ data: 12 })]).ok).toBe(false);
    expect(unpackAssets([packed({ data: '%%%' })]).errors[0]).toContain('base64');
    const svg = bytesToBase64(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'));
    expect(unpackAssets([packed({ data: svg, type: 'png', name: 'logo.png' })]).errors[0]).toContain('pas une image');
  });

  test('un nom absent ou piégé est assaini', () => {
    expect(unpackAssets([packed({ name: undefined })]).assets[0].name).toBe('image');
    expect(unpackAssets([packed({ name: '..\\..\\evil.png' })]).assets[0].name).toBe('evil.png');
  });
});

describe('lot version 4', () => {
  test('un lot emporte ses images et les rend à la lecture', () => {
    const bundle = createBackgroundPresetBundle([], [], [packed()]);
    expect(bundle.version).toBe(4);
    const parsed = parseBackgroundPresetBundle(JSON.stringify(bundle));
    expect(parsed.ok).toBe(true);
    expect(parsed.assets.map((asset) => asset.id)).toEqual([ID]);
  });

  test('un lot dont une image est invalide est refusé en entier', () => {
    const bundle = createBackgroundPresetBundle([], [], [packed({ data: '%%%' })]);
    expect(parseBackgroundPresetBundle(JSON.stringify(bundle)).ok).toBe(false);
  });

  test('les lots des versions précédentes se lisent sans image, même s’ils en déclarent', () => {
    const v3 = { format: 'overlay-background-presets', version: 3, presets: [], scenes: [], assets: [packed()] };
    expect(parseBackgroundPresetBundle(v3)).toMatchObject({ ok: true, assets: [] });
  });
});
