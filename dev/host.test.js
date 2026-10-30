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
    expect(JSON.parse(onState[0])).toMatchObject(RAIN);
    expect(JSON.parse(onState[0]).scene.layers.map((layer) => layer.kind)).toEqual(['rain', 'branding']);
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

describe('brouillons de presets', () => {
  const DRAFT = { component: 'rain', options: {}, transition: { type: 'fade', durationMs: 500 }, showBranding: false };
  const drafts = async (call) => (await (await call('/drafts')).json()).drafts;

  /** Un preset « Alpha » (bubble) enregistré ; rend son identifiant. */
  async function withPreset(context) {
    await context.post('/save-preset', { name: 'Alpha', component: 'bubble', options: {} });
    return JSON.parse(readFileSync(context.path, 'utf8')).scenes[0].id;
  }

  test('un brouillon se range sous le preset, se relit, ne touche ni l’antenne ni le preset enregistré', async () => {
    const context = setup({ now: () => '2026-10-30T10:00:00.000Z' });
    const id = await withPreset(context);
    const onState = context.subscribe('state');
    expect((await context.post('/draft', { presetId: id, state: DRAFT })).status).toBe(200);

    expect((await drafts(context.call))[id]).toMatchObject({ at: '2026-10-30T10:00:00.000Z', state: DRAFT });
    expect(onState).toEqual([]);
    const file = JSON.parse(readFileSync(context.path, 'utf8'));
    expect(file.scenes[0].layers[0].kind).toBe('bubble');
    expect(file.current.layers[0].kind).toBe('dotgrid');
  });

  test('GET /state ne porte pas les brouillons', async () => {
    const context = setup();
    const id = await withPreset(context);
    await context.post('/draft', { presetId: id, state: DRAFT });
    expect('drafts' in await (await context.call('/state')).json()).toBe(false);
  });

  test('preset inconnu : 404 ; état invalide ou sans effet : 400 ; rien n’est écrit', async () => {
    const context = setup();
    const id = await withPreset(context);
    expect((await context.post('/draft', { presetId: 'fantome', state: DRAFT })).status).toBe(404);
    expect((await context.post('/draft', { presetId: id, state: { component: 'dotgrid', options: { spacing: 'large' } } })).status).toBe(400);
    expect((await context.post('/draft', { presetId: id, state: { component: null, options: {} } })).status).toBe(400);
    expect((await context.post('/draft', { state: DRAFT })).status).toBe(400);
    expect(await drafts(context.call)).toEqual({});
  });

  test('un brouillon par preset : écrire l’un ne touche pas l’autre, réécrire remplace', async () => {
    const context = setup();
    const first = await withPreset(context);
    await context.post('/save-preset', { name: 'Beta', component: 'rain', options: {} });
    const second = JSON.parse(readFileSync(context.path, 'utf8')).scenes[1].id;
    await context.post('/draft', { presetId: first, state: DRAFT });
    await context.post('/draft', { presetId: second, state: { component: 'fireflies', options: {} } });
    await context.post('/draft', { presetId: first, state: { component: 'stars-parallax', options: {} } });
    const all = await drafts(context.call);
    expect(all[first].state.component).toBe('stars-parallax');
    expect(all[second].state.component).toBe('fireflies');
  });

  test('abandonner retire le brouillon, une seconde fois est sans effet', async () => {
    const context = setup();
    const id = await withPreset(context);
    await context.post('/draft', { presetId: id, state: DRAFT });
    expect((await context.post('/discard-draft', { presetId: id })).status).toBe(200);
    expect((await context.post('/discard-draft', { presetId: id })).status).toBe(200);
    expect(await drafts(context.call)).toEqual({});
    expect('drafts' in JSON.parse(readFileSync(context.path, 'utf8'))).toBe(false);
  });

  test('« Mettre à jour » et la suppression retirent le brouillon du preset ; le renommage le garde', async () => {
    const context = setup();
    const id = await withPreset(context);
    await context.post('/draft', { presetId: id, state: DRAFT });

    await context.post('/rename-preset', { id, name: 'Alpha bis' });
    expect(Object.keys(await drafts(context.call))).toEqual([id]);

    await context.post('/save-preset', { id, name: 'Alpha bis', component: 'rain', options: {} });
    expect(await drafts(context.call)).toEqual({});

    await context.post('/draft', { presetId: id, state: DRAFT });
    await context.post('/delete-preset', { id });
    expect(await drafts(context.call)).toEqual({});
    expect((await context.call('/state')).status).toBe(200);
  });

  test('un brouillon survit au redémarrage : le fichier se relit avec lui', async () => {
    const context = setup();
    const id = await withPreset(context);
    await context.post('/draft', { presetId: id, state: DRAFT });
    const again = createHost({
      store: createStateStore({ path: context.path, log: silent }),
      channels: createChannels(),
      obs: { status: () => ({ connected: false, reason: null, scenes: [], activeScene: null }), configured: false, inspect: null },
      control: { supervised: false, exit() {} },
      staticPort: 5931,
      log: silent,
    });
    const response = await again.fetch(new Request('http://localhost:5932/drafts'), context.server);
    expect((await response.json()).drafts[id].state.component).toBe('rain');
  });
});

// ── scènes à plusieurs couches ───────────────────────────────────────────

const layer = (id, kind, over = {}) => ({ id, kind, visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: {}, ...over });
/** Pluie en fond, bulles dans le quart haut gauche à moitié transparentes, branding par-dessus : aucune forme plate. */
const STACK = (over = {}) => ({
  version: 1,
  id: 'quelconque',
  name: 'Quelconque',
  layers: [layer('fond', 'rain'), layer('bulles', 'bubble', { opacity: 0.5, placement: { x: 0, y: 0, width: 0.5, height: 0.5 } }), layer('marque', 'branding')],
  ...over,
});
const BLANK = { component: null, options: {}, showBranding: false };
const fileOf = (path) => JSON.parse(readFileSync(path, 'utf8'));

describe('scènes à plusieurs couches', () => {
  test('POST /state { scene } : persistée telle quelle sous l’identité de l’antenne, diffusée avec une projection plate vide', async () => {
    const { post, path, subscribe, call } = setup();
    const onState = subscribe('state');
    expect((await post('/state', { scene: STACK() })).status).toBe(200);

    const stored = fileOf(path).current;
    expect(stored).toMatchObject({ id: 'current', name: 'En antenne' });
    expect(stored.layers).toEqual(STACK().layers);
    const message = JSON.parse(onState[0]);
    expect(message).toMatchObject({ ...BLANK, scene: { id: 'current', layers: STACK().layers } });

    const state = await (await call('/state')).json();
    expect(state.scene.layers).toEqual(STACK().layers);
    expect(state.current).toEqual(BLANK);
  });

  test('l’une ou l’autre : scène et forme plate ensemble, une scène invalide ou à neuf couches sont refusées sans rien écrire', async () => {
    const { post, path, subscribe } = setup();
    const onState = subscribe('state');
    expect((await post('/state', { scene: STACK(), current: RAIN })).status).toBe(400);
    expect((await post('/state', { scene: STACK({ layers: [layer('a', 'inconnu')] }) })).status).toBe(400);
    const nine = Array.from({ length: 9 }, (_, index) => layer(`c${index}`, 'rain'));
    const tooMany = await post('/state', { scene: STACK({ layers: nine }) });
    expect(tooMany.status).toBe(400);
    expect(await tooMany.text()).toContain('8 couches au plus');
    expect(onState).toEqual([]);
    expect(existsSync(path)).toBe(false);
  });

  test('une scène vide est une antenne valide ; une scène reçue est ramenée à la forme neutre (ancien nom d’effet)', async () => {
    const { post, path } = setup();
    expect((await post('/state', { scene: STACK({ layers: [] }) })).status).toBe(200);
    expect(fileOf(path).current).toBeNull();
    expect((await post('/state', { scene: STACK({ layers: [layer('a', 'RainBackground', { options: { audioReactive: 'Oui' } })] }) })).status).toBe(200);
    expect(fileOf(path).current.layers[0]).toMatchObject({ kind: 'rain', options: { audioReactive: true } });
  });

  test('la scène remplacée entre dans l’historique avec toutes ses couches ; revenir en arrière la remet et la diffuse', async () => {
    const { post, call, subscribe, path } = setup({ now: () => '2026-10-30T10:00:00.000Z' });
    await post('/state', { scene: STACK() });
    await post('/state', { current: RAIN });
    const history = (await (await call('/history')).json()).history;
    expect(history).toHaveLength(2);
    expect(history[0].scene.layers).toEqual(STACK().layers);
    expect(history[0].current).toEqual(BLANK);

    const onState = subscribe('state');
    expect((await post('/rollback', { at: history[0].at })).status).toBe(200);
    expect(JSON.parse(onState[0]).scene.layers).toEqual(STACK().layers);
    expect(fileOf(path).current.layers).toEqual(STACK().layers);
  });

  test('un preset se range par sa scène complète, se relit, et GET /state le garde hors de la liste plate', async () => {
    const { post, call, path } = setup();
    expect((await post('/save-preset', { scene: STACK({ name: 'Pile', tags: ['soir'] }) })).status).toBe(200);
    const [stored] = fileOf(path).scenes;
    expect(stored).toMatchObject({ id: 'pile', name: 'Pile', tags: ['soir'] });
    expect(stored.layers).toEqual(STACK().layers);

    const state = await (await call('/state')).json();
    expect(state.scenes.map(({ id }) => id)).toEqual(['pile']);
    expect(state.presets).toEqual([]);
  });

  test('une scène sans effet ou au nom invalide est refusée comme preset ; scène et forme plate ensemble aussi', async () => {
    const { post } = setup();
    expect((await post('/save-preset', { scene: STACK({ layers: [layer('marque', 'branding')] }) })).status).toBe(400);
    expect((await post('/save-preset', { scene: STACK({ name: ' ' }) })).status).toBe(400);
    expect((await post('/save-preset', { scene: STACK(), name: 'Alpha', component: 'rain', options: {} })).status).toBe(400);
  });

  test('enregistrer sur un preset existant le remplace en gardant son identifiant, retire son brouillon, refuse un nom déjà pris', async () => {
    const { post, path } = setup();
    await post('/save-preset', { scene: STACK({ name: 'Pile' }) });
    await post('/save-preset', { name: 'Autre', component: 'rain', options: {} });
    await post('/draft', { presetId: 'pile', scene: STACK() });
    expect(fileOf(path).drafts.pile).toBeDefined();

    const updated = STACK({ name: 'Pile', layers: [layer('seul', 'bubble')] });
    expect((await post('/save-preset', { id: 'pile', scene: updated })).status).toBe(200);
    const file = fileOf(path);
    expect(file.scenes.find(({ id }) => id === 'pile').layers.map((l) => l.id)).toEqual(['seul']);
    expect(file.drafts).toBeUndefined();
    expect((await post('/save-preset', { id: 'pile', scene: STACK({ name: 'Autre' }) })).status).toBe(409);
  });

  test('l’enregistrement plat d’un preset à plusieurs couches est refusé (409), jamais appliqué en le tronquant', async () => {
    const { post, path } = setup();
    await post('/save-preset', { scene: STACK({ name: 'Pile' }) });
    const before = readFileSync(path, 'utf8');
    const response = await post('/save-preset', { id: 'pile', name: 'Pile', component: 'rain', options: {} });
    expect(response.status).toBe(409);
    expect(readFileSync(path, 'utf8')).toBe(before);
  });

  test('un brouillon de scène se range, se relit avec ses couches, exige un effet, et n’atteint pas l’antenne', async () => {
    const { post, call, subscribe, path } = setup({ now: () => '2026-10-30T10:00:00.000Z' });
    await post('/save-preset', { scene: STACK({ name: 'Pile' }) });
    const onState = subscribe('state');
    expect((await post('/draft', { presetId: 'pile', scene: STACK({ layers: [layer('fond', 'rain'), layer('x', 'bubble')] }) })).status).toBe(200);
    const stored = (await (await call('/drafts')).json()).drafts.pile;
    expect(stored.scene.layers.map((l) => l.id)).toEqual(['fond', 'x']);
    expect(stored.state).toEqual(BLANK);
    expect(onState).toEqual([]);
    expect(fileOf(path).current.layers[0].kind).toBe('dotgrid');
    expect((await post('/draft', { presetId: 'pile', scene: STACK({ layers: [layer('marque', 'branding')] }) })).status).toBe(400);
    expect((await post('/draft', { presetId: 'pile', scene: STACK(), state: RAIN })).status).toBe(400);
  });

  test('une scène OBS associée à un preset à plusieurs couches l’applique en entier, sans ses étiquettes', async () => {
    const { post, host, subscribe, path } = setup();
    await post('/save-preset', { scene: STACK({ name: 'Pile', tags: ['soir'], transition: { type: 'fade', durationMs: 300 } }) });
    await post('/scene-map', { sceneMap: { Jeu: 'pile' } });
    const onState = subscribe('state');
    await host.applySceneMapping('Jeu');
    const current = fileOf(path).current;
    expect(current).toMatchObject({ id: 'current', name: 'En antenne', transition: { type: 'fade', durationMs: 300 } });
    expect(current.tags).toBeUndefined();
    expect(current.layers).toEqual(STACK().layers);
    expect(JSON.parse(onState[0]).scene.layers).toEqual(STACK().layers);
  });

  test('renommer, dupliquer et supprimer valent aussi pour une scène à plusieurs couches', async () => {
    const { post, path } = setup();
    await post('/save-preset', { scene: STACK({ name: 'Pile' }) });
    expect((await post('/rename-preset', { id: 'pile', name: 'Pile bis' })).status).toBe(200);
    expect((await post('/duplicate-preset', { id: 'pile' })).status).toBe(200);
    const scenes = fileOf(path).scenes;
    expect(scenes.map(({ name }) => name)).toEqual(['Pile bis', 'Pile bis — copie']);
    expect(scenes[1].layers).toEqual(STACK().layers);
    expect((await post('/delete-preset', { id: 'pile' })).status).toBe(200);
    expect(fileOf(path).scenes.map(({ id }) => id)).toEqual(['pile-bis-copie']);
  });

  test('un fichier qui porte une scène à plusieurs couches se relit après redémarrage (nouveau magasin, même fichier)', async () => {
    const first = setup();
    await first.post('/save-preset', { scene: STACK({ name: 'Pile' }) });
    await first.post('/state', { scene: STACK() });
    await first.post('/draft', { presetId: 'pile', scene: STACK() });
    const again = createHost({
      store: createStateStore({ path: first.path, log: silent }),
      channels: createChannels(),
      obs: { status: () => ({ connected: false, reason: 'not-configured', scenes: [], activeScene: null }), configured: false, inspect: null },
      control: { supervised: false, exit() {} },
      staticPort: 5931,
      log: silent,
    });
    const state = await (await again.fetch(new Request('http://localhost:5932/state'), first.server)).json();
    expect(state.scene.layers).toEqual(STACK().layers);
    expect(state.scenes[0].layers).toEqual(STACK().layers);
  });
});

describe('import de presets avec des scènes à plusieurs couches', () => {
  const bundle = (presets) => ({ format: 'overlay-background-presets', version: 2, presets });
  const flat = (over = {}) => ({ id: 'plat', name: 'Plat', component: 'rain', options: {}, ...over });

  test('la bibliothèque garde sa scène à plusieurs couches intacte, à sa place, et son nom reste pris', async () => {
    const { post, path } = setup();
    await post('/save-preset', { scene: STACK({ name: 'Pile' }) });
    await post('/save-preset', { name: 'Zeta', component: 'rain', options: {} });
    const preview = await (await post('/preview-import', { bundle: bundle([flat({ name: 'Pile' }), flat({ id: 'autre', name: 'Autre' })]) })).json();
    expect(preview.created).toBe(2);
    expect(preview.renamed).toBe(1);
    expect((await post('/import-presets', { bundle: bundle([flat({ name: 'Pile' }), flat({ id: 'autre', name: 'Autre' })]), expectedRevision: preview.revision })).status).toBe(200);

    const scenes = fileOf(path).scenes;
    expect(scenes.map(({ id }) => id)).toEqual(['pile', 'zeta', 'plat', 'autre']);
    expect(scenes[0].layers).toEqual(STACK().layers);
    expect(scenes[2].name).toBe('Pile — import');
  });

  test('un lot qui reprend l’identifiant d’une scène à plusieurs couches est refusé (409), aperçu comme import', async () => {
    const { post, path } = setup();
    await post('/save-preset', { scene: STACK({ name: 'Pile' }) });
    const before = readFileSync(path, 'utf8');
    const clash = bundle([flat({ id: 'pile', name: 'Pile' })]);
    expect((await post('/preview-import', { bundle: clash })).status).toBe(409);
    expect((await post('/import-presets', { bundle: clash, expectedRevision: 'x' })).status).toBe(409);
    expect(readFileSync(path, 'utf8')).toBe(before);
  });

  test('modifier une scène à plusieurs couches entre l’aperçu et l’import invalide la révision (409)', async () => {
    const { post } = setup();
    await post('/save-preset', { scene: STACK({ name: 'Pile' }) });
    const preview = await (await post('/preview-import', { bundle: bundle([flat()]) })).json();
    await post('/save-preset', { id: 'pile', scene: STACK({ name: 'Pile', layers: [layer('seul', 'rain')] }) });
    expect((await post('/import-presets', { bundle: bundle([flat()]), expectedRevision: preview.revision })).status).toBe(409);
  });
});

describe('import de scènes à plusieurs couches (lot version 3)', () => {
  const bundle = (presets, scenes) => ({ format: 'overlay-background-presets', version: 3, presets, scenes });

  test('un lot version 3 ajoute ses scènes en entier, à la suite, et annonce le détail dans l’aperçu', async () => {
    const { post, path } = setup();
    await post('/save-preset', { name: 'Zeta', component: 'rain', options: {} });
    const imported = STACK({ id: 'nuit', name: 'Nuit' });
    const preview = await (await post('/preview-import', { bundle: bundle([], [imported]) })).json();
    expect(preview.created).toBe(1);
    expect(preview.changes[0]).toMatchObject({ id: 'nuit', operation: 'created', component: expect.stringContaining('couches') });
    expect((await post('/import-presets', { bundle: bundle([], [imported]), expectedRevision: preview.revision })).status).toBe(200);
    const scenes = fileOf(path).scenes;
    expect(scenes.map(({ id }) => id)).toEqual(['zeta', 'nuit']);
    expect(scenes[1].layers).toEqual(STACK().layers);
  });

  test('une scène identique à une scène existante est ignorée, une scène différente de même identifiant ne l’écrase jamais', async () => {
    const { post, path } = setup();
    await post('/save-preset', { scene: STACK({ id: 'pile', name: 'Pile' }) });
    const same = await (await post('/preview-import', { bundle: bundle([], [fileOf(path).scenes[0]]) })).json();
    expect(same.unchanged).toBe(1);
    expect(same.created).toBe(0);
    const different = STACK({ id: 'pile', name: 'Pile', layers: [layer('seul', 'rain')] });
    const preview = await (await post('/preview-import', { bundle: bundle([], [different]) })).json();
    expect(preview.created).toBe(1);
    await post('/import-presets', { bundle: bundle([], [different]), expectedRevision: preview.revision });
    const scenes = fileOf(path).scenes;
    expect(scenes).toHaveLength(2);
    expect(scenes[0].layers).toEqual(STACK().layers);
    expect(scenes[1].id).toBe('pile-2');
    expect(scenes[1].name).toContain('import');
  });

  test('un lot qui mêle presets plats et scènes à plusieurs couches applique les deux, noms compris', async () => {
    const { post, path } = setup();
    await post('/save-preset', { name: 'Zeta', component: 'rain', options: {} });
    const flat = { id: 'plat', name: 'Zeta', component: 'rain', options: {} };
    const multi = STACK({ id: 'nuit', name: 'Zeta' });
    const preview = await (await post('/preview-import', { bundle: bundle([flat], [multi]) })).json();
    expect(preview.created).toBe(2);
    expect(preview.renamed).toBe(2);
    await post('/import-presets', { bundle: bundle([flat], [multi]), expectedRevision: preview.revision });
    const names = fileOf(path).scenes.map(({ name }) => name);
    expect(new Set(names).size).toBe(3);
  });

  test('une scène invalide refuse tout le lot (400), sans rien écrire', async () => {
    const { post, path } = setup();
    const before = existsSync(path);
    const bad = { version: 1, id: 'x', name: 'X', layers: [{ id: 'a', kind: 'inconnu' }] };
    const response = await post('/preview-import', { bundle: bundle([], [bad]) });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('scenes[0]');
    expect(existsSync(path)).toBe(before);
  });
});

describe('réglages du Studio', () => {
  const COMMAND = { id: 'custom.ma-macro', name: 'Ma macro', steps: ['edit.copy', { op: 'setPlacements', args: { patch: { x: 0.1 } }, target: 'selection' }], shortcut: 'Ctrl+Maj+K' };
  const settings = async (call) => (await call('/studio-settings')).json();

  test('un fichier neuf rend des réglages vides', async () => {
    const { call } = setup();
    expect(await settings(call)).toEqual({ customCommands: [], preferences: {}, templates: [] });
  });

  test('POST range les commandes en bloc et fusionne les préférences ; null retire une clé ; le fichier les garde', async () => {
    const { post, call, path } = setup();
    expect((await post('/studio-settings', { customCommands: [COMMAND], preferences: { 'view.grid': true, 'placement.unit': 'pixel' } })).status).toBe(200);
    expect((await post('/studio-settings', { preferences: { 'view.grid': null, 'view.rulers': true } })).status).toBe(200);
    expect(await settings(call)).toEqual({ customCommands: [COMMAND], preferences: { 'placement.unit': 'pixel', 'view.rulers': true }, templates: [] });
    expect(JSON.parse(readFileSync(path, 'utf8')).studio.customCommands[0].name).toBe('Ma macro');
    await post('/studio-settings', { customCommands: [] });
    expect((await settings(call)).customCommands).toEqual([]);
    expect((await settings(call)).preferences['placement.unit']).toBe('pixel');
  });

  test('une demande invalide est refusée en 400 sans rien écrire ni diffuser', async () => {
    const { post, subscribe, path } = setup();
    const onStudio = subscribe('studio');
    const refused = await post('/studio-settings', { customCommands: [{ id: 'pas-custom', name: 'x', steps: ['a'] }] });
    expect(refused.status).toBe(400);
    expect(await refused.text()).toContain('identifiant');
    expect((await post('/studio-settings', { preferences: { a: { b: 1 } } })).status).toBe(400);
    expect(onStudio).toEqual([]);
    expect(existsSync(path)).toBe(false);
  });

  test('le changement est diffusé sur le canal studio seulement, avec les réglages complets', async () => {
    const { post, subscribe } = setup();
    const onStudio = subscribe('studio');
    const onState = subscribe('state');
    await post('/studio-settings', { customCommands: [COMMAND], preferences: { a: 1 } });
    expect(JSON.parse(onStudio[0])).toEqual({ customCommands: [COMMAND], preferences: { a: 1 }, templates: [] });
    expect(onState).toEqual([]);
  });

  test('GET /state ne porte pas les réglages du Studio, et publier ne les efface pas', async () => {
    const { post, call, path } = setup();
    await post('/studio-settings', { customCommands: [COMMAND] });
    await post('/state', { current: RAIN });
    expect('studio' in (await (await call('/state')).json())).toBe(false);
    expect(JSON.parse(readFileSync(path, 'utf8')).studio.customCommands).toHaveLength(1);
  });

  test('un fichier dont les réglages sont invalides est refusé à la lecture, avec leur emplacement', async () => {
    const { call, path } = setup();
    writeFileSync(path, JSON.stringify({ version: 4, current: null, scenes: [], studio: { customCommands: [{ id: 'x' }] } }));
    const response = await call('/studio-settings');
    expect(response.status).toBe(500);
    expect(await response.text()).toContain('studio : customCommands[0]');
  });

  test('/studio-ws est un canal reconnu', async () => {
    const { call, server } = setup();
    await call('/studio-ws');
    expect(server.upgrades).toEqual([{ channel: 'studio', role: 'studio' }]);
  });
});
