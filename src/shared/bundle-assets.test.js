import { describe, expect, test } from 'bun:test';
import { MAX_BUNDLE_ASSETS, base64ToBytes, bytesToBase64, countCodeLayers, packAssets, referencedAssetIds, unpackAssets } from './bundle-assets.js';
import { createBackgroundPresetBundle, parseBackgroundPresetBundle } from '../../studio/presets/background-preset-library.js';
import { pngBytes } from '../../tools/test-images.js';

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
    expect(unpackAssets([packed({ data: svg, type: 'png', name: 'logo.png' })]).errors[0]).toContain('pas un fichier accepté');
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

describe('countCodeLayers', () => {
  const code = { kind: 'code', options: { html: '' } };

  test('compte les couches Code des scènes et des presets, où qu’elles soient', () => {
    expect(countCodeLayers([], [{ layers: [code, { kind: 'rain', options: {} }, code] }, { layers: [code] }])).toBe(3);
    expect(countCodeLayers([{ layers: [code] }], [])).toBe(1);
  });

  test('un texte qui parle de code, ou un type voisin, n’en est pas une', () => {
    expect(countCodeLayers([], [{ layers: [{ kind: 'text', options: { text: ['kind: code'] } }, { kind: 'code' }, { kind: 'codec', options: {} }] }])).toBe(0);
    expect(countCodeLayers(undefined, null)).toBe(0);
  });
});

describe('unpackAssets — scripts et modèles 3D', () => {
  const script = bytesToBase64(new TextEncoder().encode('export default 1;'));

  test('un script voyage avec son nom : reconnu à l’extension et au contenu', () => {
    const result = unpackAssets([{ id: ID, name: 'three.module.js', type: 'js', data: script }]);
    expect(result.ok).toBe(true);
    expect(result.assets[0].type).toBe('js');
  });

  test('le même texte sous un nom d’image est refusé, comme un script au nom effacé', () => {
    expect(unpackAssets([{ id: ID, name: 'logo.png', type: 'png', data: script }]).ok).toBe(false);
    expect(unpackAssets([{ id: ID, type: 'js', data: script }]).ok).toBe(false);
  });
});
