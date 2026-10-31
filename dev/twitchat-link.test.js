import { describe, expect, test } from 'bun:test';
import { createChannels } from './channels.js';
import { createEventIntake } from './event-intake.js';
import { MAX_MESSAGE_BYTES, createTwitchatLink, sameSecret } from './twitchat-link.js';

const TOKEN = 'ab'.repeat(24);

function setup(options = {}) {
  const channels = createChannels();
  const broadcast = [];
  channels.add({ data: { channel: 'event', role: 'render' }, send: (payload) => broadcast.push(JSON.parse(payload)) });
  const intake = createEventIntake({ channels, ...(options.intake ?? {}) });
  const link = createTwitchatLink({ intake, getToken: async () => TOKEN, ...(options.link ?? {}) });
  const upgrades = [];
  const server = { upgrade(req, { data }) { upgrades.push(data); return options.upgradeFails !== true; } };
  /** @param {string} path @param {Record<string, string>} [headers] */
  const request = (path, headers = { upgrade: 'websocket' }) => {
    const req = new Request(`http://127.0.0.1:5932${path}`, { headers });
    return { req, url: new URL(req.url) };
  };
  /** @param {boolean} [authed] */
  const socket = (authed = false) => {
    const replies = [];
    const closed = [];
    return { data: { ingest: 'twitchat', authed }, send: (payload) => replies.push(JSON.parse(payload)), close: (code, reason) => closed.push({ code, reason }), replies, closed };
  };
  return { link, intake, broadcast, upgrades, server, request, socket };
}

describe('sameSecret', () => {
  test('égal seulement si identique', () => {
    expect(sameSecret('abc', 'abc')).toBe(true);
    expect(sameSecret('abc', 'abd')).toBe(false);
    expect(sameSecret('abc', 'abcd')).toBe(false);
    expect(sameSecret('', '')).toBe(true);
  });
});

describe('handles', () => {
  test('seulement une demande WebSocket sur / ou /twitchat-ws', () => {
    const { link, request } = setup();
    for (const path of ['/', '/twitchat-ws']) {
      const { req, url } = request(path);
      expect(link.handles(req, url)).toBe(true);
    }
    const plain = request('/', {});
    expect(link.handles(plain.req, plain.url)).toBe(false);
    const other = request('/state-ws');
    expect(link.handles(other.req, other.url)).toBe(false);
    const upper = request('/', { upgrade: 'WebSocket' });
    expect(link.handles(upper.req, upper.url)).toBe(true);
  });
});

describe('accept', () => {
  test('avec le bon jeton dans l’adresse, la connexion est authentifiée', async () => {
    const { link, request, server, upgrades } = setup();
    const { req, url } = request(`/twitchat-ws?token=${TOKEN}`);
    expect(await link.accept(req, url, server)).toBeUndefined();
    expect(upgrades).toEqual([{ ingest: 'twitchat', authed: true }]);
  });

  test('sans jeton dans l’adresse, la connexion est acceptée mais pas authentifiée (le jeton viendra dans le message)', async () => {
    const { link, request, server, upgrades } = setup();
    const { req, url } = request('/');
    expect(await link.accept(req, url, server)).toBeUndefined();
    expect(upgrades).toEqual([{ ingest: 'twitchat', authed: false }]);
  });

  test('un jeton faux dans l’adresse : 401, pas de connexion, la raison est notée', async () => {
    const { link, request, server, upgrades } = setup();
    const { req, url } = request('/twitchat-ws?token=faux');
    const response = await link.accept(req, url, server);
    expect(response?.status).toBe(401);
    expect(upgrades).toEqual([]);
    expect(link.view().lastError).toContain('jeton de l’adresse est faux');
  });

  test('au-delà du nombre de clients : 429', async () => {
    const { link, request, server, socket } = setup({ link: { maxClients: 2 } });
    link.open(socket());
    link.open(socket());
    const { req, url } = request('/');
    expect((await link.accept(req, url, server))?.status).toBe(429);
  });

  test('une montée en protocole qui échoue : 500', async () => {
    const { link, request, server } = setup({ upgradeFails: true });
    const { req, url } = request('/');
    expect((await link.accept(req, url, server))?.status).toBe(500);
  });
});

describe('message', () => {
  test('une alerte valide d’un client authentifié est diffusée, journalisée, accusée', async () => {
    const { link, intake, broadcast, socket } = setup();
    const ws = socket(true);
    await link.message(ws, JSON.stringify({ type: 'raid', username: 'Zoé', amount: '25' }));
    expect(broadcast).toEqual([{ type: 'raid', username: 'Zoé', amount: 25 }]);
    expect(intake.recent()[0]).toMatchObject({ source: 'twitchat', type: 'raid', username: 'Zoé', amount: 25 });
    expect(ws.replies).toEqual([{ ok: true, type: 'raid' }]);
    expect(link.view().lastAlertAt).not.toBeNull();
    expect(link.view().lastError).toBeNull();
  });

  test('le jeton peut venir dans le message, et authentifie la connexion pour la suite', async () => {
    const { link, broadcast, socket } = setup();
    const ws = socket(false);
    await link.message(ws, JSON.stringify({ type: 'follow', token: TOKEN }));
    expect(broadcast).toHaveLength(1);
    expect(ws.data.authed).toBe(true);
    await link.message(ws, JSON.stringify({ type: 'follow' }));
    expect(broadcast).toHaveLength(2);
  });

  test('sans jeton ni dans l’adresse ni dans le message : refusé, rien n’est diffusé, la raison est dite', async () => {
    const { link, broadcast, socket } = setup();
    const ws = socket(false);
    await link.message(ws, JSON.stringify({ type: 'follow' }));
    expect(broadcast).toEqual([]);
    expect(ws.replies[0]).toMatchObject({ ok: false });
    expect(ws.replies[0].error).toContain('jeton');
    expect(link.view().lastError).toContain('jeton');
  });

  test('un jeton faux dans le message : refusé', async () => {
    const { link, broadcast, socket } = setup();
    const ws = socket(false);
    await link.message(ws, JSON.stringify({ type: 'follow', token: 'faux' }));
    expect(broadcast).toEqual([]);
    expect(ws.data.authed).toBe(false);
  });

  test('un jeton qui n’est pas un texte : refusé sans planter', async () => {
    const { link, broadcast, socket } = setup();
    const ws = socket(false);
    await link.message(ws, JSON.stringify({ type: 'follow', token: 12 }));
    await link.message(ws, JSON.stringify(['follow']));
    expect(broadcast).toEqual([]);
  });

  test('du texte qui n’est pas du JSON : refusé avec la raison', async () => {
    const { link, socket } = setup();
    const ws = socket(true);
    await link.message(ws, 'pas du json');
    expect(ws.replies[0]).toEqual({ ok: false, error: 'message reçu : ce n’est pas du JSON valide' });
    expect(link.view().lastError).toBe('message reçu : ce n’est pas du JSON valide');
  });

  test('un message trop long : refusé avant d’être lu', async () => {
    const { link, broadcast, socket } = setup();
    const ws = socket(true);
    await link.message(ws, JSON.stringify({ type: 'follow', username: 'x'.repeat(MAX_MESSAGE_BYTES) }));
    expect(broadcast).toEqual([]);
    expect(ws.replies[0].error).toContain('trop long');
  });

  test('un message binaire est lu comme du texte', async () => {
    const { link, broadcast, socket } = setup();
    await link.message(socket(true), new TextEncoder().encode(JSON.stringify({ type: 'follow' })));
    expect(broadcast).toHaveLength(1);
  });

  test('un type inconnu : refusé avec la raison de l’adaptateur', async () => {
    const { link, broadcast, socket } = setup();
    const ws = socket(true);
    await link.message(ws, JSON.stringify({ type: 'MESSAGE_FIRST' }));
    expect(broadcast).toEqual([]);
    expect(ws.replies[0].error).toContain('type d’alerte inconnu');
  });

  test('le limiteur protège le rendu : la rafale suivante est refusée et dite', async () => {
    const { link, broadcast, socket } = setup({ intake: { burst: 2 } });
    const ws = socket(true);
    for (let index = 0; index < 3; index += 1) await link.message(ws, JSON.stringify({ type: 'follow' }));
    expect(broadcast).toHaveLength(2);
    expect(ws.replies[2].error).toContain('trop d’alertes');
  });

  test('une alerte réussie efface la dernière erreur', async () => {
    const { link, socket } = setup();
    const ws = socket(true);
    await link.message(ws, 'pas du json');
    expect(link.view().lastError).not.toBeNull();
    await link.message(ws, JSON.stringify({ type: 'follow' }));
    expect(link.view().lastError).toBeNull();
  });

  test('chaque message note l’instant de réception, même refusé', async () => {
    const { link, socket } = setup({ link: { now: () => 5_000 } });
    await link.message(socket(true), 'pas du json');
    expect(link.view().lastMessageAt).toBe(new Date(5_000).toISOString());
  });
});

describe('clients', () => {
  test('open et close tiennent le compte', () => {
    const { link, socket } = setup();
    const a = socket();
    const b = socket();
    link.open(a);
    link.open(b);
    expect(link.view().clients).toBe(2);
    link.close(a);
    expect(link.view().clients).toBe(1);
  });

  test('disconnectAll coupe tout le monde avec le code 4401', () => {
    const { link, socket } = setup();
    const a = socket();
    const b = socket();
    link.open(a);
    link.open(b);
    link.disconnectAll();
    expect(a.closed).toEqual([{ code: 4401, reason: 'jeton régénéré' }]);
    expect(b.closed).toHaveLength(1);
    expect(link.view().clients).toBe(0);
  });
});
