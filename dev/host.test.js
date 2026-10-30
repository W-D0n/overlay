import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createChannels } from './channels.js';
import { createHost } from './host.js';
import { createStateStore } from './state-store.js';

/** @type {string[]} */
const directories = [];
const silent = { info() {}, warn() {}, error() {} };

/** @param {Partial<Parameters<typeof createHost>[0]>} [overrides] */
function setup(overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-host-'));
  directories.push(directory);
  const path = join(directory, 'state.json');
  const channels = createChannels();
  const exits = [];
  const host = createHost({
    store: createStateStore({ path, log: silent }),
    channels,
    obs: { status: () => ({ connected: false, reason: 'not-configured', scenes: [], activeScene: null }), configured: false, inspect: null },
    control: { supervised: true, exit: (code) => exits.push(code) },
    staticPort: 5931,
    log: silent,
    ...overrides,
  });
  const server = { upgrades: [], upgrade(req, options) { this.upgrades.push(options.data); return true; } };
  /** @param {string} pathname @param {RequestInit} [init] */
  const call = (pathname, init) => host.fetch(new Request(`http://localhost:5932${pathname}`, init), server);
  /** @param {string} pathname @param {unknown} body @param {Record<string,string>} [headers] */
  const post = (pathname, body, headers = {}) => call(pathname, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const subscribe = (channel, role = 'studio') => {
    const sent = [];
    channels.add({ data: { channel, role }, send: (payload) => sent.push(payload) });
    return sent;
  };
  return { host, path, call, post, server, subscribe, exits };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const RAIN = { component: 'rain', options: {} };

describe('état courant', () => {
  test('POST /state persiste puis diffuse sur le canal state seulement', async () => {
    const { post, path, subscribe } = setup();
    const onState = subscribe('state');
    const onEvent = subscribe('event');
    const response = await post('/state', { current: RAIN });
    expect(response.status).toBe(200);
    expect(JSON.parse(onState[0])).toEqual(RAIN);
    expect(onEvent).toEqual([]);
    expect(JSON.parse(readFileSync(path, 'utf8')).current.layers[0].kind).toBe('rain');
  });

  test('un état invalide est refusé en 400, sans écriture ni diffusion', async () => {
    const { post, subscribe, path } = setup();
    const onState = subscribe('state');
    const response = await post('/state', { current: { component: 'dotgrid', options: { spacing: 'large' } } });
    expect(response.status).toBe(400);
    expect(onState).toEqual([]);
    expect(existsSync(path)).toBe(false);
  });

  test('un fichier d’état illisible : 500 avec les erreurs, jamais de reset silencieux', async () => {
    const { call, path } = setup();
    writeFileSync(path, '{ cassé');
    const response = await call('/state');
    expect(response.status).toBe(500);
    expect(await response.text()).toContain('fichier d\'état invalide');
    expect(readFileSync(path, 'utf8')).toBe('{ cassé');
  });
});

describe('routage', () => {
  test('route inconnue : 404', async () => {
    const { call, post } = setup();
    expect((await call('/nimporte')).status).toBe(404);
    expect((await post('/nimporte', {})).status).toBe(404);
  });

  test('les routes de presets sont montées : enregistrer puis annoncer sur presets', async () => {
    const { post, subscribe } = setup();
    const onPresets = subscribe('presets');
    const response = await post('/save-preset', { name: 'Alpha', component: 'rain', options: {} });
    expect(response.status).toBe(200);
    expect(JSON.parse(onPresets[0])).toMatchObject({ name: 'Alpha', action: 'saved' });
  });

  test('une page d’origine étrangère est refusée avant toute route', async () => {
    const { call } = setup();
    const response = await call('/state', { headers: { Origin: 'https://pirate.example' } });
    expect(response.status).toBe(403);
  });

  test('un WebSocket annonce son canal et son rôle ; /state-ws?role=render est une page de rendu', async () => {
    const { call, server } = setup();
    await call('/state-ws?role=render');
    await call('/event-ws');
    expect(server.upgrades).toEqual([{ channel: 'state', role: 'render' }, { channel: 'event', role: 'studio' }]);
  });

  test('/live-status compte les pages de rendu, pas le Studio', async () => {
    const { call, subscribe } = setup();
    subscribe('state', 'render');
    subscribe('state', 'studio');
    expect(await (await call('/live-status')).json()).toEqual({ renderPages: 1 });
  });
});

describe('contrôle du processus', () => {
  test('supervisé et avec l’en-tête : 202 puis sortie 75 (relance) ou 0 (arrêt)', async () => {
    const { post, exits } = setup();
    expect((await post('/control/restart', {}, { 'X-Overlay-Control': '1' })).status).toBe(202);
    expect((await post('/control/stop', {}, { 'X-Overlay-Control': '1' })).status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(exits.sort()).toEqual([0, 75]);
  });

  test('sans l’en-tête : 400 ; hors lanceur : 501 ; aucune sortie demandée', async () => {
    const supervised = setup();
    expect((await supervised.post('/control/stop', {})).status).toBe(400);
    const loose = setup({ control: { supervised: false, exit: () => { throw new Error('ne doit pas sortir'); } } });
    expect((await loose.post('/control/stop', {}, { 'X-Overlay-Control': '1' })).status).toBe(501);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(supervised.exits).toEqual([]);
  });
});

describe('scène OBS → preset', () => {
  test('une scène associée applique son preset, le persiste et le diffuse ; une scène inconnue ne change rien', async () => {
    const { host, post, path, subscribe } = setup();
    await post('/save-preset', { name: 'Alpha', component: 'rain', options: {} });
    const saved = JSON.parse(readFileSync(path, 'utf8'));
    const presetId = saved.scenes[0].id;
    await post('/scene-map', { sceneMap: { 'Jeu': presetId } });

    const onState = subscribe('state');
    await host.applySceneMapping('Inconnue');
    expect(onState).toEqual([]);

    await host.applySceneMapping('Jeu');
    expect(onState).toHaveLength(1);
    expect(JSON.parse(readFileSync(path, 'utf8')).current.layers[0].kind).toBe('rain');
  });
});

describe('historique des publications', () => {
  const DOTS = { component: 'dotgrid', options: {} };
  const history = async (call) => (await (await call('/history')).json()).history;

  test('une publication range l’état remplacé ; GET /state ne porte pas l’historique', async () => {
    const { post, call } = setup({ now: () => '2026-10-30T10:00:00.000Z' });
    await post('/state', { current: RAIN });
    await post('/state', { current: DOTS });
    const entries = await history(call);
    expect(entries.map((entry) => entry.current.component)).toEqual(['rain', 'dotgrid']);
    expect('history' in await (await call('/state')).json()).toBe(false);
  });

  test('republier le même état, ou publier deux fois dans la même milliseconde, laisse un fichier relisible', async () => {
    const { post, call } = setup({ now: () => '2026-10-30T10:00:00.000Z' });
    await post('/state', { current: RAIN });
    await post('/state', { current: { ...RAIN } });
    await post('/state', { current: DOTS });
    await post('/state', { current: RAIN });
    expect((await call('/state')).status).toBe(200);
    expect((await history(call)).map((entry) => entry.current.component)).toEqual(['dotgrid', 'rain', 'dotgrid']);
  });

  test('revenir en arrière remet l’état à l’antenne, le diffuse et se défait comme une publication', async () => {
    const { post, call, subscribe, path } = setup();
    await post('/state', { current: RAIN });
    await post('/state', { current: DOTS });
    const onState = subscribe('state');
    const [target] = await history(call);
    expect(target.current.component).toBe('rain');

    expect((await post('/rollback', { at: target.at })).status).toBe(200);
    expect(onState.map((payload) => JSON.parse(payload).component)).toEqual(['rain']);
    expect(JSON.parse(readFileSync(path, 'utf8')).current.layers[0].kind).toBe('rain');

    const [undo] = await history(call);
    expect(undo.current.component).toBe('dotgrid');
    await post('/rollback', { at: undo.at });
    expect(JSON.parse(readFileSync(path, 'utf8')).current.layers[0].kind).toBe('dotgrid');
  });

  test('un instant inconnu : 404 sans rien changer ; sans instant : 400', async () => {
    const { post, call, subscribe } = setup();
    await post('/state', { current: RAIN });
    await post('/state', { current: DOTS });
    const onState = subscribe('state');
    expect((await post('/rollback', { at: '1999-01-01T00:00:00.000Z' })).status).toBe(404);
    expect((await post('/rollback', {})).status).toBe(400);
    expect(onState).toEqual([]);
    expect(await history(call)).toHaveLength(2);
  });

  test('un changement de scène OBS n’entre pas dans l’historique', async () => {
    const { host, post, call, path } = setup();
    await post('/save-preset', { name: 'Alpha', component: 'bubble', options: {} });
    await post('/state', { current: RAIN });
    expect(await history(call)).toHaveLength(1);

    const presetId = JSON.parse(readFileSync(path, 'utf8')).scenes[0].id;
    await post('/scene-map', { sceneMap: { Jeu: presetId } });
    await host.applySceneMapping('Jeu');

    expect(JSON.parse(readFileSync(path, 'utf8')).current.layers[0].kind).toBe('bubble');
    expect(await history(call)).toHaveLength(1);
  });
});
