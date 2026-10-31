import { describe, expect, test } from 'bun:test';
import { createLayer } from '../scene-doc.js';
import { CLIPBOARD_FORMAT, createLayerClipboard, layersPayload, parsePayload, styleOf } from './layer-clipboard.js';

const L = (id, kind = 'rain', over = {}) => createLayer({ id, kind, ...over });

function fakeStorage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data };
}

describe('contenu', () => {
  test('layersPayload copie en profondeur ; styleOf garde type, opacité et réglages', () => {
    const layer = L('a', 'rain', { opacity: 0.4, options: { speed: 2 } });
    const payload = layersPayload([layer]);
    layer.options.speed = 99;
    expect(payload.layers[0].options.speed).toBe(2);
    expect(payload.format).toBe(CLIPBOARD_FORMAT);
    expect(styleOf(L('b', 'bubble', { opacity: 0.7, options: { count: 5 } }))).toEqual({ kind: 'bubble', opacity: 0.7, options: { count: 5 }, look: {} });
  });

  test('parsePayload accepte un contenu valide, texte ou objet', () => {
    const payload = layersPayload([L('a')]);
    expect(parsePayload(payload).ok).toBe(true);
    expect(parsePayload(JSON.stringify(payload))).toMatchObject({ ok: true, style: null });
  });

  test('refuse un texte illisible, un autre format, une autre version, des couches invalides', () => {
    expect(parsePayload('{pas du json')).toMatchObject({ ok: false, error: 'presse-papiers illisible' });
    expect(parsePayload({ format: 'autre', version: 1, layers: [] }).ok).toBe(false);
    expect(parsePayload({ format: CLIPBOARD_FORMAT, version: 2, layers: [] }).ok).toBe(false);
    expect(parsePayload(null).ok).toBe(false);
    const broken = parsePayload({ format: CLIPBOARD_FORMAT, version: 1, layers: [{ ...L('a'), kind: 'inconnu' }] });
    expect(broken.ok).toBe(false);
    expect(broken.error).toContain('couches invalides');
  });

  test('refuse plus de huit couches', () => {
    const many = Array.from({ length: 9 }, (_, i) => L(`l${i}`));
    expect(parsePayload(layersPayload(many)).ok).toBe(false);
  });

  test('un style mal formé est ignoré, pas fatal', () => {
    const parsed = parsePayload({ ...layersPayload([L('a')]), style: { kind: 3 } });
    expect(parsed).toMatchObject({ ok: true, style: null });
  });
});

describe('presse-papiers', () => {
  test('copier puis relire : couches et style de la première couche', () => {
    const clipboard = createLayerClipboard();
    expect(clipboard.hasLayers()).toBe(false);
    expect(clipboard.read()).toMatchObject({ ok: false });
    expect(clipboard.copy([L('a', 'rain', { opacity: 0.5 }), L('b', 'bubble')])).toBe(true);
    const parsed = clipboard.read();
    expect(parsed.ok && parsed.layers.map((l) => l.id)).toEqual(['a', 'b']);
    expect(parsed.ok && parsed.style).toMatchObject({ kind: 'rain', opacity: 0.5 });
    expect(clipboard.hasLayers()).toBe(true);
    expect(clipboard.hasStyle()).toBe(true);
  });

  test('copier rien ne fait rien et ne vide pas le contenu précédent', () => {
    const clipboard = createLayerClipboard();
    clipboard.copy([L('a')]);
    expect(clipboard.copy([])).toBe(false);
    expect(clipboard.hasLayers()).toBe(true);
  });

  test('copyStyle change le style sans toucher aux couches copiées', () => {
    const clipboard = createLayerClipboard();
    clipboard.copy([L('a', 'rain')]);
    clipboard.copyStyle(L('z', 'bubble', { opacity: 0.2, options: { count: 9 } }));
    const parsed = clipboard.read();
    expect(parsed.ok && parsed.layers.map((l) => l.id)).toEqual(['a']);
    expect(parsed.ok && parsed.style).toEqual({ kind: 'bubble', opacity: 0.2, options: { count: 9 }, look: {} });
  });

  test('copyStyle sans couches copiées : un style, aucune couche à coller', () => {
    const clipboard = createLayerClipboard();
    clipboard.copyStyle(L('z'));
    expect(clipboard.hasStyle()).toBe(true);
    expect(clipboard.hasLayers()).toBe(false);
  });

  test('partagé par le stockage : un second presse-papiers sur le même stockage relit la copie', () => {
    const storage = fakeStorage();
    createLayerClipboard({ storage }).copy([L('a')]);
    expect(createLayerClipboard({ storage }).hasLayers()).toBe(true);
  });

  test('un stockage qui lève (plein, refusé) ne casse rien : le contenu reste en mémoire', () => {
    const hostile = { getItem() { throw new Error('refusé'); }, setItem() { throw new Error('plein'); } };
    const clipboard = createLayerClipboard({ storage: hostile });
    expect(clipboard.copy([L('a')])).toBe(true);
    expect(clipboard.hasLayers()).toBe(true);
  });

  test('un contenu corrompu dans le stockage est refusé proprement', () => {
    const storage = fakeStorage();
    storage.setItem('overlay.studio.clipboard', '{"format":"overlay-layers","version":1,"layers":[{"id":"a"}]}');
    const clipboard = createLayerClipboard({ storage });
    expect(clipboard.read().ok).toBe(false);
    expect(clipboard.hasLayers()).toBe(false);
  });
});
