import { describe, expect, test } from 'bun:test';
import {
  MAX_ASSET_BYTES, MAX_ASSET_NAME, MAX_ASSET_PIXELS, collectAssetUsage, inspectAsset, readAssetDimensions, sanitizeAssetName, sniffAssetType,
} from './asset-format.js';
import { gifBytes, jpegBytes, pngBytes, webpBytes } from './test-images.js';

describe('sniffAssetType : le type vient de l’en-tête du fichier', () => {
  test('reconnaît PNG, JPEG, GIF et WebP', () => {
    expect(sniffAssetType(pngBytes(2, 2))).toBe('png');
    expect(sniffAssetType(jpegBytes(2, 2))).toBe('jpeg');
    expect(sniffAssetType(gifBytes(2, 2))).toBe('gif');
    expect(sniffAssetType(webpBytes(2, 2))).toBe('webp');
  });

  test('refuse le reste : SVG, texte, exécutable, fichier trop court, vide', () => {
    const text = (value) => new TextEncoder().encode(value);
    expect(sniffAssetType(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffAssetType(text('MZ\u0090\u0000fichier exécutable'))).toBeNull();
    expect(sniffAssetType(text('hello'))).toBeNull();
    expect(sniffAssetType(new Uint8Array())).toBeNull();
    expect(sniffAssetType(Uint8Array.from([0x89, 0x50]))).toBeNull();
  });

  test('un JPEG se reconnaît à ses trois premiers octets, pas aux deux premiers', () => {
    expect(sniffAssetType(Uint8Array.from([0xff, 0xd8, 0x00, 0x00]))).toBeNull();
  });

  test('un RIFF qui n’est pas du WebP (WAV) est refusé', () => {
    const ascii = (text) => [...text].map((char) => char.charCodeAt(0));
    expect(sniffAssetType(Uint8Array.from([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVEfmt ')]))).toBeNull();
  });
});

describe('readAssetDimensions', () => {
  test('lit les dimensions de chaque format sans décoder', () => {
    expect(readAssetDimensions(pngBytes(640, 360), 'png')).toEqual({ width: 640, height: 360 });
    expect(readAssetDimensions(gifBytes(120, 80), 'gif')).toEqual({ width: 120, height: 80 });
    expect(readAssetDimensions(jpegBytes(1920, 1080), 'jpeg')).toEqual({ width: 1920, height: 1080 });
    expect(readAssetDimensions(webpBytes(800, 600, 'extended'), 'webp')).toEqual({ width: 800, height: 600 });
    expect(readAssetDimensions(webpBytes(321, 123, 'lossy'), 'webp')).toEqual({ width: 321, height: 123 });
    expect(readAssetDimensions(webpBytes(1000, 500, 'lossless'), 'webp')).toEqual({ width: 1000, height: 500 });
  });

  test('un JPEG dont un segment de tables précède la trame donne les dimensions de la trame, pas celles du segment', () => {
    const tables = [0xff, 0xc4, 0x00, 0x14, ...new Array(18).fill(0x07)];
    const bytes = Uint8Array.from([0xff, 0xd8, ...tables, 0xff, 0xc0, 0x00, 0x11, 8, 0x01, 0xf4, 0x03, 0x20, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
    expect(readAssetDimensions(bytes, 'jpeg')).toEqual({ width: 800, height: 500 });
  });

  test('un fichier tronqué ou des dimensions nulles donnent null', () => {
    expect(readAssetDimensions(pngBytes(10, 10).slice(0, 14), 'png')).toBeNull();
    expect(readAssetDimensions(pngBytes(0, 10), 'png')).toBeNull();
    expect(readAssetDimensions(jpegBytes(10, 10).slice(0, 12), 'jpeg')).toBeNull();
    expect(readAssetDimensions(gifBytes(0, 0), 'gif')).toBeNull();
  });
});

describe('inspectAsset : les limites', () => {
  test('une image valide donne son type et ses dimensions', () => {
    expect(inspectAsset(pngBytes(100, 50))).toEqual({ ok: true, type: 'png', width: 100, height: 50 });
  });

  test('refuse un fichier vide, d’un autre format, tronqué', () => {
    expect(inspectAsset(new Uint8Array())).toMatchObject({ ok: false, error: 'fichier vide' });
    expect(inspectAsset(new TextEncoder().encode('pas une image'))).toMatchObject({ ok: false });
    expect(inspectAsset(pngBytes(10, 10).slice(0, 14))).toMatchObject({ ok: false, error: 'image illisible ou tronquée' });
  });

  test('refuse un fichier trop lourd, une image démesurée ; accepte la limite exacte', () => {
    expect(inspectAsset(pngBytes(10, 10, MAX_ASSET_BYTES))).toMatchObject({ ok: false });
    expect(inspectAsset(pngBytes(10, 10, MAX_ASSET_BYTES - pngBytes(10, 10, 0).length)).ok).toBe(true);
    expect(inspectAsset(pngBytes(100_000, 100_000))).toMatchObject({ ok: false });
    const side = Math.floor(Math.sqrt(MAX_ASSET_PIXELS));
    expect(inspectAsset(pngBytes(side, side)).ok).toBe(true);
    expect(inspectAsset(pngBytes(side + 1, side + 1)).ok).toBe(false);
  });
});

describe('sanitizeAssetName', () => {
  test('ne garde que le nom du fichier : sans chemin ni caractère de contrôle, borné', () => {
    expect(sanitizeAssetName('C:\\Users\\moi\\affiche.png')).toBe('affiche.png');
    expect(sanitizeAssetName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeAssetName('a\u0000b\u001fc.png')).toBe('abc.png');
    expect(sanitizeAssetName('x'.repeat(500))).toHaveLength(MAX_ASSET_NAME);
  });

  test('un nom vide ou absent devient « image »', () => {
    expect(sanitizeAssetName('')).toBe('image');
    expect(sanitizeAssetName(null)).toBe('image');
    expect(sanitizeAssetName('   ')).toBe('image');
    expect(sanitizeAssetName('dossier/')).toBe('image');
  });
});

describe('collectAssetUsage', () => {
  const a = 'a'.repeat(32);
  const b = 'b'.repeat(32);

  test('compte les références où qu’elles soient : scènes, brouillons, historique', () => {
    const state = { scenes: [{ layers: [{ options: { asset: a } }, { options: { asset: a } }] }], drafts: { x: { layers: [{ options: { asset: b } }] } }, history: [{ scene: { layers: [{ options: { asset: a } }] } }] };
    expect([...collectAssetUsage(state)].sort()).toEqual([[a, 3], [b, 1]]);
  });

  test('ignore une valeur qui n’est pas un identifiant, et une clé d’un autre nom', () => {
    expect(collectAssetUsage({ options: { asset: 'pas-un-id', autre: a } }).size).toBe(0);
    expect(collectAssetUsage(null).size).toBe(0);
    expect(collectAssetUsage([1, 'x', { asset: 7 }]).size).toBe(0);
  });
});
