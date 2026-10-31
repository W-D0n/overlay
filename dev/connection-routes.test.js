import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnectionRoutes } from './connection-routes.js';
import { createConnectionStore } from './connection-store.js';

/** @type {string[]} */
const directories = [];
const silent = { error() {} };

/** @param {{ env?: Record<string, string>, status?: object }} [options] */
function setup({ env = {}, status = { connected: false, reason: 'not-configured', scenes: [], activeScene: null } } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-connection-routes-'));
  directories.push(directory);
  const path = join(directory, 'state.json.connections.json');
  const restarts = [];
  const obs = { restart: async () => { restarts.push(Date.now()); }, status: () => status, configured: false, inspect: async () => ({}) };
  const routes = createConnectionRoutes({ store: createConnectionStore({ path }), obs, env, log: silent });
  /** @param {string} pathname @param {RequestInit} [init] */
  const call = (pathname, init) => routes.handle(new Request(`http://localhost:5932${pathname}`, init), new URL(`http://localhost:5932${pathname}`));
  /** @param {unknown} body @param {Record<string, string>} [headers] */
  const postObs = (body, headers = { 'X-Overlay-Control': '1' }) => call('/connections/obs', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { routes, call, postObs, restarts, path };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('GET /connections', () => {
  test('sans rien : non configuré, adresse par défaut', async () => {
    const body = await (await setup().call('/connections')).json();
    expect(body.obs).toMatchObject({ url: 'ws://127.0.0.1:4455', passwordSet: false, source: 'none', configured: false, urlFromSettings: false });
  });

  test('un mot de passe de l’environnement est dit « enregistré » sans être montré', async () => {
    const response = await setup({ env: { OBS_WS_PASSWORD: 'dans-le-env' } }).call('/connections');
    const text = await response.text();
    expect(JSON.parse(text).obs).toMatchObject({ passwordSet: true, source: 'env' });
    expect(text).not.toContain('dans-le-env');
  });

  test('l’état de la connexion est celui d’OBS', async () => {
    const { call } = setup({ status: { connected: true, reason: null, scenes: ['A', 'B'], activeScene: 'B' } });
    expect((await (await call('/connections')).json()).obs).toMatchObject({ connected: true, scenes: ['A', 'B'], activeScene: 'B' });
  });

  test('un fichier illisible : 500 qui le dit, et le fichier n’est pas touché', async () => {
    const { call, path } = setup();
    writeFileSync(path, '{ cassé');
    const response = await call('/connections');
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain('illisible');
    expect(readFileSync(path, 'utf8')).toBe('{ cassé');
  });
});

describe('POST /connections/obs', () => {
  test('enregistre, reconnecte une fois, et ne renvoie jamais le mot de passe', async () => {
    const { postObs, restarts, path } = setup();
    const response = await postObs({ password: 'très-secret', url: 'ws://127.0.0.1:4466' });
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(restarts).toHaveLength(1);
    expect(JSON.parse(text).obs).toMatchObject({ url: 'ws://127.0.0.1:4466', passwordSet: true, source: 'settings', urlFromSettings: true });
    expect(text).not.toContain('très-secret');
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ obs: { url: 'ws://127.0.0.1:4466', password: 'très-secret' } });
  });

  test('exige l’en-tête X-Overlay-Control : sans lui, rien n’est écrit ni reconnecté', async () => {
    const { postObs, restarts, path } = setup();
    const response = await postObs({ password: 'x' }, {});
    expect(response.status).toBe(400);
    expect(restarts).toHaveLength(0);
    expect(existsSync(path)).toBe(false);
  });

  test('une valeur refusée : 400 avec la raison, rien d’écrit, pas de reconnexion', async () => {
    const { postObs, restarts, path } = setup();
    const response = await postObs({ url: 'http://pas-un-websocket' });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('ws://');
    expect(restarts).toHaveLength(0);
    expect(existsSync(path)).toBe(false);
  });

  test('un corps qui n’est pas du JSON : 400', async () => {
    const { call } = setup();
    const response = await call('/connections/obs', { method: 'POST', headers: { 'X-Overlay-Control': '1' }, body: 'pas du json' });
    expect(response.status).toBe(400);
  });

  test('changer seulement l’adresse garde le mot de passe', async () => {
    const { postObs, path } = setup();
    await postObs({ password: 'gardé' });
    await postObs({ url: 'ws://127.0.0.1:9999' });
    expect(JSON.parse(readFileSync(path, 'utf8')).obs).toEqual({ password: 'gardé', url: 'ws://127.0.0.1:9999' });
  });

  test('null efface la saisie : on retombe sur l’environnement', async () => {
    const { postObs } = setup({ env: { OBS_WS_PASSWORD: 'env' } });
    await postObs({ password: 'saisi' });
    const body = await (await postObs({ password: null })).json();
    expect(body.obs).toMatchObject({ passwordSet: true, source: 'env' });
  });

  test('les écritures simultanées sont toutes gardées', async () => {
    const { postObs, path } = setup();
    await Promise.all([postObs({ url: 'ws://127.0.0.1:1' }), postObs({ password: 'p' })]);
    expect(JSON.parse(readFileSync(path, 'utf8')).obs).toEqual({ url: 'ws://127.0.0.1:1', password: 'p' });
  });
});

test('une route inconnue : 404', async () => {
  const { call } = setup();
  expect((await call('/connections/autre', { method: 'POST' })).status).toBe(404);
  expect((await call('/connections', { method: 'DELETE' })).status).toBe(404);
});

test('handles ne prend que /connections et ses sous-chemins', () => {
  const { routes } = setup();
  expect(routes.handles('/connections')).toBe(true);
  expect(routes.handles('/connections/obs')).toBe(true);
  expect(routes.handles('/connectionsx')).toBe(false);
  expect(routes.handles('/state')).toBe(false);
});
