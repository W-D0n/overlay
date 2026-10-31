import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAssetStore } from './asset-store.js';
import { gifBytes, pngBytes } from './test-images.js';

/** @type {string[]} */
const directories = [];
function setup() {
  const base = mkdtempSync(join(tmpdir(), 'overlay-assets-'));
  directories.push(base);
  const dir = join(base, 'assets');
  let tick = 0;
  return { dir, store: createAssetStore({ dir, now: () => new Date(Date.UTC(2026, 9, 31, 12, 0, tick++)).toISOString() }) };
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('magasin d’assets', () => {
  test('range une image : identifiant tiré du contenu, métadonnées lues, fichier et index écrits', async () => {
    const { store, dir } = setup();
    const result = await store.put(pngBytes(640, 360), 'C:\\affiches\\jeu.png');
    expect(result.ok).toBe(true);
    expect(result.created).toBe(true);
    expect(result.asset).toMatchObject({ name: 'jeu.png', type: 'png', mime: 'image/png', width: 640, height: 360, bytes: pngBytes(640, 360).length });
    expect(result.asset.id).toMatch(/^[0-9a-f]{32}$/);
    expect(existsSync(join(dir, `${result.asset.id}.png`))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).assets[result.asset.id].name).toBe('jeu.png');
  });

  test('la même image importée deux fois est un seul asset ; deux images différentes, deux assets', async () => {
    const { store, dir } = setup();
    const first = await store.put(pngBytes(10, 10), 'a.png');
    const again = await store.put(pngBytes(10, 10), 'copie.png');
    const other = await store.put(gifBytes(10, 10), 'b.gif');
    expect(again.created).toBe(false);
    expect(again.asset.id).toBe(first.asset.id);
    expect(again.asset.name).toBe('a.png');
    expect(other.asset.id).not.toBe(first.asset.id);
    expect((await store.list()).length).toBe(2);
    expect(readdirSync(dir).filter((name) => name !== 'index.json').length).toBe(2);
  });

  test('un fichier refusé ne laisse aucune trace', async () => {
    const { store, dir } = setup();
    expect(await store.put(new TextEncoder().encode('<svg/>'), 'x.svg')).toMatchObject({ ok: false });
    expect(await store.list()).toEqual([]);
    expect(existsSync(dir)).toBe(false);
  });

  test('la liste montre le plus récent d’abord', async () => {
    const { store } = setup();
    await store.put(pngBytes(1, 1), 'ancien.png');
    await store.put(pngBytes(2, 2), 'recent.png');
    expect((await store.list()).map((asset) => asset.name)).toEqual(['recent.png', 'ancien.png']);
  });

  test('relit les octets d’un asset ; un identifiant inconnu ou mal formé donne null', async () => {
    const { store } = setup();
    const { asset } = await store.put(pngBytes(5, 5), 'a.png');
    const found = await store.read(asset.id);
    expect(found.meta.id).toBe(asset.id);
    expect([...found.bytes]).toEqual([...pngBytes(5, 5)]);
    expect(await store.read('f'.repeat(32))).toBeNull();
    expect(await store.read('../index')).toBeNull();
    expect(await store.read('')).toBeNull();
  });

  test('un asset dont le fichier a disparu se lit comme absent, sans lever', async () => {
    const { store, dir } = setup();
    const { asset } = await store.put(pngBytes(5, 5), 'a.png');
    rmSync(join(dir, `${asset.id}.png`));
    expect(await store.read(asset.id)).toBeNull();
  });

  test('retire un asset : fichier et entrée ; retirer deux fois donne faux', async () => {
    const { store, dir } = setup();
    const { asset } = await store.put(pngBytes(5, 5), 'a.png');
    expect(await store.remove(asset.id)).toBe(true);
    expect(existsSync(join(dir, `${asset.id}.png`))).toBe(false);
    expect(await store.list()).toEqual([]);
    expect(await store.remove(asset.id)).toBe(false);
    expect(await store.remove('../../x')).toBe(false);
  });

  test('des imports simultanés ne perdent aucune entrée de l’index', async () => {
    const { store } = setup();
    await Promise.all(Array.from({ length: 12 }, (_, index) => store.put(pngBytes(index + 1, index + 1), `n${index}.png`)));
    expect((await store.list()).length).toBe(12);
  });

  test('un index illisible n’est jamais écrasé en silence : l’erreur remonte et le fichier reste', async () => {
    const { store, dir } = setup();
    await store.put(pngBytes(5, 5), 'a.png');
    writeFileSync(join(dir, 'index.json'), '{ pas du json');
    await expect(store.list()).rejects.toThrow(/illisible/);
    await expect(store.put(pngBytes(6, 6), 'b.png')).rejects.toThrow(/illisible/);
    expect(readFileSync(join(dir, 'index.json'), 'utf8')).toBe('{ pas du json');
  });

  test('un index d’une autre forme est refusé de la même façon', async () => {
    const { store, dir } = setup();
    await store.put(pngBytes(5, 5), 'a.png');
    writeFileSync(join(dir, 'index.json'), '[]');
    await expect(store.list()).rejects.toThrow(/invalide/);
  });
});
