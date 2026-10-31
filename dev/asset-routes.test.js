import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createChannels } from './channels.js';
import { createHost } from './host.js';
import { createStateStore } from './state-store.js';
import { createAssetStore } from './asset-store.js';
import { MAX_ASSET_BYTES } from './asset-format.js';
import { gifBytes, jpegBytes, pngBytes } from './test-images.js';

/** @type {string[]} */
const directories = [];
const silent = { info() {}, warn() {}, error() {} };

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-asset-routes-'));
  directories.push(directory);
  const path = join(directory, 'state.json');
  const host = createHost({
    store: createStateStore({ path, log: silent }),
    assets: createAssetStore({ dir: `${path}.assets` }),
    channels: createChannels(),
    obs: { status: () => ({ connected: false, reason: null, scenes: [], activeScene: null }), configured: false, inspect: null },
    control: { supervised: true, exit() {} },
    staticPort: 5931,
    log: silent,
  });
  const server = { upgrade: () => true };
  const call = (pathname, init) => host.fetch(new Request(`http://localhost:5932${pathname}`, init), server);
  const upload = (bytes, name = 'image.png', headers = {}) => call(`/assets?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...headers }, body: bytes });
  const post = (pathname, body) => call(pathname, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { call, upload, post };
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('POST /assets', () => {
  test('importe une image : 201, l’asset décrit, créé', async () => {
    const { upload } = setup();
    const response = await upload(pngBytes(800, 450), 'affiche.png');
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.created).toBe(true);
    expect(body.asset).toMatchObject({ name: 'affiche.png', type: 'png', width: 800, height: 450 });
  });

  test('la même image une seconde fois : 201, créé: false, même identifiant', async () => {
    const { upload } = setup();
    const first = await (await upload(pngBytes(20, 20))).json();
    const again = await (await upload(pngBytes(20, 20), 'autre-nom.png')).json();
    expect(again.created).toBe(false);
    expect(again.asset.id).toBe(first.asset.id);
  });

  test('un fichier qui n’est pas une image est refusé (400), même s’il se déclare image', async () => {
    const { upload } = setup();
    const response = await upload(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'logo.png', { 'Content-Type': 'image/png' });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('format non pris en charge');
  });

  test('un fichier trop lourd est refusé (413), annoncé ou non', async () => {
    const { upload, call } = setup();
    const heavy = pngBytes(10, 10, MAX_ASSET_BYTES);
    expect((await upload(heavy)).status).toBe(413);
    const announced = await call('/assets?name=x.png', { method: 'POST', headers: { 'Content-Length': String(MAX_ASSET_BYTES + 1) }, body: pngBytes(10, 10) });
    expect(announced.status).toBe(413);
  });

  test('un corps vide est refusé', async () => {
    const { upload } = setup();
    expect((await upload(new Uint8Array())).status).toBe(400);
  });
});

describe('GET /assets', () => {
  test('liste les assets avec leur nombre d’usages', async () => {
    const { upload, call } = setup();
    const { asset } = await (await upload(pngBytes(10, 10), 'a.png')).json();
    const list = await (await call('/assets')).json();
    expect(list.assets).toEqual([expect.objectContaining({ id: asset.id, name: 'a.png', uses: 0 })]);
  });

  test('compte les scènes qui référencent une image', async () => {
    const { upload, call, post } = setup();
    const { asset } = await (await upload(pngBytes(10, 10), 'a.png')).json();
    const scene = { version: 1, id: 'affiche', name: 'Affiche', layers: [{ id: 'img', kind: 'text', visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: { asset: asset.id } }] };
    expect((await post('/save-preset', { scene })).status).toBeLessThan(300);
    expect((await (await call('/assets')).json()).assets[0].uses).toBeGreaterThan(0);
  });
});

describe('GET /assets/<id>', () => {
  test('sert les octets avec le type reconnu, un cache sans limite et l’accès entre origines', async () => {
    const { upload, call } = setup();
    const { asset } = await (await upload(jpegBytes(30, 20), 'photo.jpg')).json();
    const response = await call(`/assets/${asset.id}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...jpegBytes(30, 20)]);
  });

  test('un identifiant inconnu : 404 ; un identifiant qui n’en est pas un : 404, jamais un chemin de fichier', async () => {
    const { call } = setup();
    expect((await call(`/assets/${'a'.repeat(32)}`)).status).toBe(404);
    expect((await call('/assets/..%2Fstate.json')).status).toBe(404);
    expect((await call('/assets/index.json')).status).toBe(404);
  });
});

describe('DELETE /assets/<id>', () => {
  test('retire une image qui n’est utilisée nulle part', async () => {
    const { upload, call } = setup();
    const { asset } = await (await upload(gifBytes(4, 4), 'a.gif')).json();
    expect((await call(`/assets/${asset.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await call(`/assets/${asset.id}`)).status).toBe(404);
    expect((await call(`/assets/${asset.id}`, { method: 'DELETE' })).status).toBe(404);
  });

  test('refuse (409) tant qu’une scène utilise l’image, et dit combien de fois', async () => {
    const { upload, call, post } = setup();
    const { asset } = await (await upload(pngBytes(10, 10), 'a.png')).json();
    const scene = { version: 1, id: 'affiche', name: 'Affiche', layers: [{ id: 'img', kind: 'text', visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: { asset: asset.id } }] };
    await post('/save-preset', { scene });
    const response = await call(`/assets/${asset.id}`, { method: 'DELETE' });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.uses).toBeGreaterThan(0);
    expect(body.error).toContain('utilisée');
    expect((await call(`/assets/${asset.id}`)).status).toBe(200);
  });
});

describe('accès', () => {
  test('la préparation d’une requête entre origines autorise GET, POST et DELETE', async () => {
    const { call } = setup();
    const response = await call('/assets', { method: 'OPTIONS' });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toMatch(/GET.*POST.*DELETE/);
  });

  test('une origine étrangère ne lit ni n’écrit les assets', async () => {
    const { call } = setup();
    const response = await call('/assets', { headers: { Origin: 'https://example.com' } });
    expect(response.status).toBe(403);
  });
});

describe('GET /diagnostics : les images des scènes', () => {
  const sceneWith = (asset) => ({ version: 1, id: 'affiche', name: 'Affiche', layers: [{ id: 'img', kind: 'text', visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: { asset } }] });

  test('sans image utilisée : rien à signaler', async () => {
    const { call } = setup();
    expect((await (await call('/diagnostics')).json()).assetUse).toEqual({ referenced: 0, missing: 0 });
  });

  test('une image utilisée et présente : comptée, pas manquante', async () => {
    const { upload, call, post } = setup();
    const { asset } = await (await upload(pngBytes(10, 10), 'a.png')).json();
    await post('/save-preset', { scene: sceneWith(asset.id) });
    expect((await (await call('/diagnostics')).json()).assetUse).toEqual({ referenced: 1, missing: 0 });
  });

  test('une image utilisée mais absente de la médiathèque : manquante', async () => {
    const { call, post } = setup();
    await post('/save-preset', { scene: sceneWith('c'.repeat(32)) });
    expect((await (await call('/diagnostics')).json()).assetUse).toEqual({ referenced: 1, missing: 1 });
  });

  test('l’historique ne compte pas : il n’affiche rien à l’antenne', async () => {
    const { upload, call, post } = setup();
    const { asset } = await (await upload(pngBytes(10, 10), 'a.png')).json();
    await post('/state', { scene: { ...sceneWith(asset.id), id: 'current', name: 'En antenne' } });
    await post('/state', { scene: { version: 1, id: 'current', name: 'En antenne', layers: [{ id: 'rain', kind: 'rain', visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: {} }] } });
    // L'image n'est plus qu'dans l'historique : le diagnostic ne la réclame pas.
    expect((await (await call('/diagnostics')).json()).assetUse.referenced).toBe(0);
  });
});
