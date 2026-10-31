import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChannels } from './channels.js';
import { createHost } from './host.js';
import { createEventIntake } from './event-intake.js';
import { createTwitchatLink } from './twitchat-link.js';
import { createStateStore } from './state-store.js';
import { createAssetStore } from './asset-store.js';
import { createVersionStore } from './version-store.js';

/** Le serveur d'état composé comme en production (hôte + entrée des alertes + canal Twitchat), sans ouvrir de port. */

const TOKEN = 'cd'.repeat(24);
/** @type {string[]} */
const directories = [];
const silent = { info() {}, warn() {}, error() {} };

function setup(intakeOptions = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-twitchat-host-'));
  directories.push(directory);
  const path = join(directory, 'state.json');
  const channels = createChannels();
  const rendered = [];
  channels.add({ data: { channel: 'event', role: 'render' }, send: (payload) => rendered.push(JSON.parse(payload)) });
  const intake = createEventIntake({ channels, ...intakeOptions });
  const twitchat = createTwitchatLink({ intake, getToken: async () => TOKEN });
  const host = createHost({
    store: createStateStore({ path, log: silent }),
    assets: createAssetStore({ dir: `${path}.assets` }),
    versions: createVersionStore({ path: `${path}.versions.json` }),
    channels,
    obs: { status: () => ({ connected: false, reason: 'not-configured', scenes: [], activeScene: null }), configured: false, inspect: null },
    control: { supervised: false, exit() {} },
    intake,
    twitchat,
    staticPort: 5931,
    log: silent,
  });
  const upgrades = [];
  const server = { upgrade(req, options) { upgrades.push(options.data); return true; } };
  /** @param {string} pathname @param {Record<string, string>} [headers] */
  const call = (pathname, headers = {}) => host.fetch(new Request(`http://localhost:5932${pathname}`, { headers }), server);
  return { host, call, upgrades, rendered, intake, twitchat };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('accès au canal Twitchat', () => {
  test('la page de Twitchat (Origin étrangère) peut se connecter avec le bon jeton', async () => {
    const { call, upgrades } = setup();
    const response = await call(`/twitchat-ws?token=${TOKEN}`, { upgrade: 'websocket', origin: 'https://twitchat.fr' });
    expect(response).toBeUndefined();
    expect(upgrades).toEqual([{ ingest: 'twitchat', authed: true }]);
  });

  test('la racine reçoit aussi Twitchat (hôte et port seuls)', async () => {
    const { call, upgrades } = setup();
    expect(await call('/', { upgrade: 'websocket', origin: 'https://twitchat.fr' })).toBeUndefined();
    expect(upgrades).toEqual([{ ingest: 'twitchat', authed: false }]);
  });

  test('un mauvais jeton : 401, même depuis l’Origin de Twitchat', async () => {
    const { call, upgrades } = setup();
    const response = await call('/twitchat-ws?token=mauvais', { upgrade: 'websocket', origin: 'https://twitchat.fr' });
    expect(response?.status).toBe(401);
    expect(upgrades).toEqual([]);
  });

  test('le Host reste exigé local : un DNS rebinding n’y passe pas', async () => {
    const { host, upgrades } = setup();
    const server = { upgrade: () => true };
    const response = await host.fetch(new Request(`http://evil.example:5932/twitchat-ws?token=${TOKEN}`, { headers: { upgrade: 'websocket' } }), server);
    expect(response?.status).toBe(403);
    expect(upgrades).toEqual([]);
  });

  test('l’Origin libre ne vaut que pour ce canal : /state, /event et les autres canaux refusent toujours une Origin étrangère', async () => {
    const { call } = setup();
    for (const path of ['/state', '/connections', '/obs-status', '/state-ws', '/event-ws', '/studio-settings']) {
      expect((await call(path, { origin: 'https://twitchat.fr' }))?.status).toBe(403);
    }
    expect((await call('/event-ws', { upgrade: 'websocket', origin: 'https://twitchat.fr' }))?.status).toBe(403);
  });

  test('la racine sans demande WebSocket n’est pas le canal : 404 comme avant', async () => {
    const { call } = setup();
    expect((await call('/'))?.status).toBe(404);
  });
});

describe('du message de Twitchat à la page de rendu', () => {
  test('le dispatcher WebSocket de l’hôte route le message vers le canal Twitchat', async () => {
    const { host, rendered, intake } = setup();
    const replies = [];
    const ws = { data: { ingest: 'twitchat', authed: true }, send: (payload) => replies.push(JSON.parse(payload)), close() {} };
    host.websocket.open(ws);
    await host.websocket.message(ws, JSON.stringify({ type: 'raid', username: 'Zoé', amount: '40' }));
    expect(rendered).toEqual([{ type: 'raid', username: 'Zoé', amount: 40 }]);
    expect(replies).toEqual([{ ok: true, type: 'raid' }]);
    expect(intake.recent()[0]).toMatchObject({ source: 'twitchat', type: 'raid' });
    host.websocket.close(ws);
  });

  test('un canal ordinaire du Studio ignore les messages entrants et reste dans ses canaux', async () => {
    const { host, rendered } = setup();
    const sent = [];
    const ws = { data: { channel: 'studio', role: 'studio' }, send: (payload) => sent.push(payload) };
    host.websocket.open(ws);
    await host.websocket.message(ws, JSON.stringify({ type: 'follow' }));
    expect(rendered).toEqual([]);
    host.websocket.close(ws);
  });

  test('la taille maximale d’un message entrant est bornée', () => {
    expect(setup().host.websocket.maxPayloadLength).toBe(64 * 1024);
  });
});

describe('POST /event passe par le même point d’entrée', () => {
  test('une alerte du bouton de test est diffusée telle quelle et journalisée avec la source « studio »', async () => {
    const { host, rendered, intake } = setup();
    const response = await host.fetch(new Request('http://localhost:5932/event', { method: 'POST', body: JSON.stringify({ type: 'follow', username: 'Test' }) }), { upgrade: () => true });
    expect(response?.status).toBe(200);
    expect(rendered).toEqual([{ type: 'follow', username: 'Test' }]);
    expect(intake.recent()[0]).toMatchObject({ source: 'studio', type: 'follow', username: 'Test' });
  });

  test('au-delà de la rafale, 429 avec la raison', async () => {
    const { host, rendered } = setup({ burst: 2 });
    const send = () => host.fetch(new Request('http://localhost:5932/event', { method: 'POST', body: JSON.stringify({ type: 'follow' }) }), { upgrade: () => true });
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    const refused = await send();
    expect(refused.status).toBe(429);
    expect((await refused.json()).error).toContain('trop d’alertes');
    expect(rendered).toHaveLength(2);
  });

  test('un type inconnu reste un 400', async () => {
    const { host } = setup();
    const response = await host.fetch(new Request('http://localhost:5932/event', { method: 'POST', body: JSON.stringify({ type: 'nope' }) }), { upgrade: () => true });
    expect(response?.status).toBe(400);
  });
});
