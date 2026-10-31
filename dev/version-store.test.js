import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHost } from './host.js';
import { createChannels } from './channels.js';
import { createStateStore } from './state-store.js';
import { createAssetStore } from './asset-store.js';
import { MAX_VERSIONS_PER_SCENE, MAX_VERSION_BYTES, MAX_VERSION_NAME, createVersionStore } from './version-store.js';

/** @type {string[]} */
const directories = [];
const silent = { info() {}, warn() {}, error() {} };
const scene = (id = 'nuit', over = {}) => ({ version: 1, id, name: 'Nuit', layers: [{ id: 'a', kind: 'rain', visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: {} }], ...over });

function setupStore() {
  const base = mkdtempSync(join(tmpdir(), 'overlay-versions-'));
  directories.push(base);
  const path = join(base, 'sub', 'versions.json');
  let tick = 0;
  return { path, store: createVersionStore({ path, now: () => new Date(Date.UTC(2026, 9, 31, 12, 0, tick++)).toISOString(), random: () => String(tick) }) };
}

function setupHost() {
  const base = mkdtempSync(join(tmpdir(), 'overlay-version-routes-'));
  directories.push(base);
  const path = join(base, 'state.json');
  const host = createHost({
    store: createStateStore({ path, log: silent }),
    assets: createAssetStore({ dir: `${path}.assets` }),
    versions: createVersionStore({ path: `${path}.versions.json` }),
    channels: createChannels(),
    obs: { status: () => ({ connected: false, reason: null, scenes: [], activeScene: null }), configured: false, inspect: null },
    control: { supervised: true, exit() {} },
    staticPort: 5931,
    log: silent,
  });
  const call = (pathname, init) => host.fetch(new Request(`http://localhost:5932${pathname}`, init), { upgrade: () => true });
  const post = (pathname, body) => call(pathname, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { call, post };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('magasin de versions', () => {
  test('garde une scène sous un nom : identifiant, date, copie de la scène, fichier écrit (dossier créé au besoin)', async () => {
    const { store, path } = setupStore();
    const source = scene();
    const result = await store.add({ scene: source, name: '  Avant   le gros changement ' });
    expect(result.ok).toBe(true);
    expect(result.version).toMatchObject({ key: 'nuit', name: 'Avant le gros changement', at: '2026-10-31T12:00:00.000Z' });
    expect(result.version.id).toMatch(/^v-/);
    source.layers[0].options.speed = 9;
    expect(result.version.scene.layers[0].options).toEqual({});
    expect(JSON.parse(readFileSync(path, 'utf8')).versions.length).toBe(1);
  });

  test('refuse un nom vide ou trop long, une scène invalide ou trop lourde ; rien n’est écrit', async () => {
    const { store, path } = setupStore();
    expect((await store.add({ scene: scene(), name: '   ' })).ok).toBe(false);
    expect((await store.add({ scene: scene(), name: 'x'.repeat(MAX_VERSION_NAME + 1) })).ok).toBe(false);
    expect((await store.add({ scene: { ...scene(), layers: [{ id: 'a', kind: 'inconnu' }] }, name: 'v' })).error).toContain('scène invalide');
    const heavy = scene('lourde', { name: 'x'.repeat(MAX_VERSION_BYTES) });
    expect((await store.add({ scene: heavy, name: 'v' })).error).toContain('trop volumineuse');
    expect(existsSync(path)).toBe(false);
  });

  test('un nom est unique dans sa scène (sans tenir compte de la casse), mais libre dans une autre', async () => {
    const { store } = setupStore();
    await store.add({ scene: scene('nuit'), name: 'Vendredi' });
    expect((await store.add({ scene: scene('nuit'), name: 'vendredi' })).error).toContain('déjà');
    expect((await store.add({ scene: scene('jour'), name: 'Vendredi' })).ok).toBe(true);
  });

  test('une scène a 30 versions au plus : la 31e est refusée, rien n’est supprimé à la place de l’utilisateur', async () => {
    const { store } = setupStore();
    for (let index = 0; index < MAX_VERSIONS_PER_SCENE; index += 1) expect((await store.add({ scene: scene('nuit'), name: `v${index}` })).ok).toBe(true);
    const refused = await store.add({ scene: scene('nuit'), name: 'une de trop' });
    expect(refused.ok).toBe(false);
    expect(refused.error).toContain('30 versions au plus');
    expect((await store.list('nuit')).length).toBe(MAX_VERSIONS_PER_SCENE);
    expect((await store.add({ scene: scene('autre'), name: 'ailleurs' })).ok).toBe(true);
  });

  test('la liste montre la plus récente d’abord, et seulement la scène demandée', async () => {
    const { store } = setupStore();
    await store.add({ scene: scene('nuit'), name: 'ancienne' });
    await store.add({ scene: scene('jour'), name: 'autre scène' });
    await store.add({ scene: scene('nuit'), name: 'récente' });
    expect((await store.list('nuit')).map((version) => version.name)).toEqual(['récente', 'ancienne']);
    expect((await store.list()).length).toBe(3);
    expect(await store.list('absente')).toEqual([]);
  });

  test('renomme (nom libre dans sa scène) ; une version absente ou un nom pris est refusé', async () => {
    const { store } = setupStore();
    const a = (await store.add({ scene: scene(), name: 'A' })).version;
    await store.add({ scene: scene(), name: 'B' });
    expect((await store.rename(a.id, 'C')).version.name).toBe('C');
    expect((await store.rename(a.id, 'b')).error).toContain('déjà');
    expect(await store.rename('v-inconnue', 'D')).toMatchObject({ ok: false, missing: true });
    expect((await store.rename(a.id, '')).ok).toBe(false);
    expect((await store.rename(a.id, 'C')).ok).toBe(true);
  });

  test('supprime : vrai la première fois, faux ensuite', async () => {
    const { store } = setupStore();
    const { version } = await store.add({ scene: scene(), name: 'A' });
    expect(await store.remove(version.id)).toBe(true);
    expect(await store.remove(version.id)).toBe(false);
    expect(await store.list()).toEqual([]);
  });

  test('des ajouts simultanés ne perdent aucune version', async () => {
    const { store } = setupStore();
    await Promise.all(Array.from({ length: 15 }, (_, index) => store.add({ scene: scene('nuit'), name: `n${index}` })));
    expect((await store.list('nuit')).length).toBe(15);
  });

  test('un fichier illisible ou d’une autre forme n’est jamais écrasé en silence', async () => {
    const { store, path } = setupStore();
    await store.add({ scene: scene(), name: 'A' });
    writeFileSync(path, '{ pas du json');
    await expect(store.list()).rejects.toThrow(/illisible/);
    await expect(store.add({ scene: scene(), name: 'B' })).rejects.toThrow(/illisible/);
    expect(readFileSync(path, 'utf8')).toBe('{ pas du json');
    writeFileSync(path, '[]');
    await expect(store.list()).rejects.toThrow(/invalide/);
  });
});

describe('routes /versions', () => {
  test('garde, liste, renomme et supprime', async () => {
    const { call, post } = setupHost();
    const created = await post('/versions', { scene: scene(), name: 'Vendredi' });
    expect(created.status).toBe(201);
    const { version } = await created.json();
    const listed = await (await call('/versions?scene=nuit')).json();
    expect(listed.versions.map((entry) => entry.name)).toEqual(['Vendredi']);
    expect((await (await call('/versions?scene=jour')).json()).versions).toEqual([]);
    const renamed = await post('/versions/rename', { id: version.id, name: 'Samedi' });
    expect((await renamed.json()).version.name).toBe('Samedi');
    expect((await call(`/versions/${version.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await call(`/versions/${version.id}`, { method: 'DELETE' })).status).toBe(404);
  });

  test('distingue une entrée invalide (400), un nom pris ou une limite atteinte (409), une version absente (404)', async () => {
    const { post } = setupHost();
    expect((await post('/versions', { scene: scene(), name: '' })).status).toBe(400);
    expect((await post('/versions', { scene: { n: 'importe quoi' }, name: 'v' })).status).toBe(400);
    expect((await post('/versions', null)).status).toBe(400);
    await post('/versions', { scene: scene(), name: 'A' });
    expect((await post('/versions', { scene: scene(), name: 'a' })).status).toBe(409);
    expect((await post('/versions/rename', { id: 'v-absente', name: 'x' })).status).toBe(404);
    for (let index = 0; index < MAX_VERSIONS_PER_SCENE - 1; index += 1) await post('/versions', { scene: scene(), name: `v${index}` });
    expect((await post('/versions', { scene: scene(), name: 'trop' })).status).toBe(409);
  });

  test('la préparation d’une requête entre origines autorise la suppression ; une origine étrangère est refusée', async () => {
    const { call } = setupHost();
    const preflight = await call('/versions', { method: 'OPTIONS' });
    expect(preflight.headers.get('access-control-allow-methods')).toContain('DELETE');
    expect((await call('/versions', { headers: { Origin: 'https://example.com' } })).status).toBe(403);
  });
});
