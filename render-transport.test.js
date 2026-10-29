import { describe, expect, test } from 'bun:test';
import { createCachedTransport, createLocalTransport } from './render-transport.js';

const FILE = {
  current: { component: 'RainBackground', options: { speed: 1 } },
  presets: [{ id: 'ondes', name: 'Ondes', component: 'WaterRippleBackground', options: {} }],
  branding: { name: 'D0n' },
};

/** Serveur d'état simulé : fetch, WebSocket et minuterie pilotés à la main. */
function createFakeServer() {
  const sockets = [];
  const timers = [];
  let file = FILE;
  let reachable = true;

  class FakeWebSocket {
    constructor(url) {
      this.path = new URL(url).pathname;
      this.closed = false;
      sockets.push(this);
    }
    open() { this.onopen?.(); }
    send(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
    drop() { this.closed = true; this.onclose?.(); }
  }

  return {
    sockets,
    timers,
    setFile(next) { file = next; },
    setReachable(value) { reachable = value; },
    fetchImpl: async () => {
      if (!reachable) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify(file), { status: 200 });
    },
    WebSocketImpl: FakeWebSocket,
    setTimeoutImpl: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    channel: (path) => sockets.filter((socket) => socket.path === path && !socket.closed).at(-1),
    runTimers() { for (const { callback } of timers.splice(0)) callback(); },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function recorder() {
  const log = [];
  return {
    log,
    handlers: {
      onState: (state) => log.push(['state', state]),
      onCurrent: (current) => log.push(['current', current]),
      onBranding: (branding) => log.push(['branding', branding]),
      onEvent: (event) => log.push(['event', event]),
      onStatus: (status) => log.push(['status', status]),
    },
    of: (kind) => log.filter(([type]) => type === kind).map(([, value]) => value),
  };
}

const transports = {
  local: (server, options = {}) => createLocalTransport({
    baseUrl: 'http://localhost:5932',
    fetchImpl: server.fetchImpl,
    WebSocketImpl: server.WebSocketImpl,
    setTimeoutImpl: server.setTimeoutImpl,
    ...options,
  }),
  cached: (server, options = {}) => createCachedTransport(
    transports.local(server, options),
    createMemoryStorage(),
  ),
};

function createMemoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => { data[key] = value; },
    data,
  };
}

for (const [name, create] of Object.entries(transports)) {
  describe(`contrat de transport — ${name}`, () => {
    test('à l’abonnement, l’état complet est livré puis la connexion annoncée', async () => {
      const server = createFakeServer();
      const { handlers, of } = recorder();
      create(server).subscribe(handlers);
      server.channel('/state-ws').open();
      await flush();
      expect(of('state').at(-1)).toEqual(FILE);
      expect(of('status')).toContain('connected');
    });

    test('un état courant poussé par le serveur arrive tel quel', async () => {
      const server = createFakeServer();
      const { handlers, of } = recorder();
      create(server).subscribe(handlers);
      server.channel('/state-ws').open();
      await flush();
      const pushed = { component: 'BubbleBackground', options: { count: 5 } };
      server.channel('/state-ws').send(pushed);
      expect(of('current')).toEqual([pushed]);
    });

    test('le branding et les événements éphémères passent par leurs canaux', async () => {
      const server = createFakeServer();
      const { handlers, of } = recorder();
      create(server).subscribe(handlers);
      server.channel('/branding-ws').open();
      server.channel('/branding-ws').send({ name: 'Nouveau' });
      server.channel('/event-ws').send({ type: 'follow', username: 'abc' });
      expect(of('branding')).toEqual([{ name: 'Nouveau' }]);
      expect(of('event')).toEqual([{ type: 'follow', username: 'abc' }]);
    });

    test('après une coupure, la connexion est rétablie et l’état manqué est relu', async () => {
      const server = createFakeServer();
      const { handlers, of } = recorder();
      create(server).subscribe(handlers);
      server.channel('/state-ws').open();
      await flush();

      const updated = { ...FILE, current: { component: 'BubbleBackground', options: {} } };
      server.setFile(updated);
      server.channel('/state-ws').drop();
      expect(of('status')).toContain('disconnected');

      server.runTimers();
      server.channel('/state-ws').open();
      await flush();
      expect(of('state').at(-1)).toEqual(updated);
    });

    test('le délai de reconnexion double jusqu’à 30 s puis repart de 1 s après une connexion réussie', async () => {
      const server = createFakeServer();
      create(server).subscribe(recorder().handlers);
      for (let attempt = 0; attempt < 7; attempt += 1) {
        server.channel('/state-ws').drop();
        server.runTimers();
      }
      const delays = server.timers.length === 0 ? [] : server.timers.map(({ delay }) => delay);
      server.channel('/state-ws').drop();
      const last = server.timers.at(-1).delay;
      expect(last).toBeLessThanOrEqual(30000);
      expect(delays.every((delay) => delay <= 30000)).toBe(true);
      server.runTimers();
      server.channel('/state-ws').open();
      server.channel('/state-ws').drop();
      expect(server.timers.at(-1).delay).toBe(1000);
    });

    test('désabonné, plus rien n’est livré et plus aucune reconnexion n’est planifiée', async () => {
      const server = createFakeServer();
      const { handlers, log } = recorder();
      const unsubscribe = create(server).subscribe(handlers);
      server.channel('/state-ws').open();
      await flush();
      unsubscribe();
      const before = log.length;
      const socket = server.channel('/state-ws');
      socket?.send({ component: 'RainBackground', options: {} });
      socket?.drop();
      expect(log.length).toBe(before);
      expect(server.timers).toEqual([]);
    });

    test('en suivi de preset, seule la modification de ce preset relit l’état', async () => {
      const server = createFakeServer();
      const { handlers, of } = recorder();
      create(server, { presetRef: 'ondes' }).subscribe(handlers);
      server.channel('/presets-ws').open();
      await flush();
      const initial = of('state').length;

      server.channel('/presets-ws').send({ id: 'autre', name: 'Autre' });
      await flush();
      expect(of('state').length).toBe(initial);

      server.channel('/presets-ws').send({ id: 'ondes', name: 'Ondes' });
      await flush();
      expect(of('state').length).toBe(initial + 1);
      expect(server.channel('/state-ws')).toBeUndefined();
    });
  });
}

describe('transport avec cache', () => {
  test('rend le dernier état connu avant que le serveur réponde, puis réconcilie', async () => {
    const server = createFakeServer();
    const storage = createMemoryStorage({ 'overlay:render-state': JSON.stringify(FILE) });
    server.setReachable(false);
    const { handlers, of } = recorder();
    createCachedTransport(transports.local(server), storage).subscribe(handlers);
    await flush();
    expect(of('state')).toEqual([FILE]);

    const fresh = { ...FILE, current: { component: 'BubbleBackground', options: {} } };
    server.setFile(fresh);
    server.setReachable(true);
    server.channel('/state-ws').open();
    await flush();
    expect(of('state').at(-1)).toEqual(fresh);
    expect(JSON.parse(storage.data['overlay:render-state'])).toEqual(fresh);
  });

  test('les mises à jour poussées sont mémorisées, les événements éphémères jamais', async () => {
    const server = createFakeServer();
    const storage = createMemoryStorage();
    createCachedTransport(transports.local(server), storage).subscribe(recorder().handlers);
    server.channel('/state-ws').open();
    await flush();
    server.channel('/state-ws').send({ component: 'BubbleBackground', options: { count: 2 } });
    server.channel('/event-ws').send({ type: 'follow', username: 'abc' });
    const stored = JSON.parse(storage.data['overlay:render-state']);
    expect(stored.current).toEqual({ component: 'BubbleBackground', options: { count: 2 } });
    expect(JSON.stringify(stored)).not.toContain('follow');
  });

  test('un stockage indisponible ou corrompu ne casse jamais le rendu', async () => {
    const server = createFakeServer();
    const broken = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    const { handlers, of } = recorder();
    createCachedTransport(transports.local(server), broken).subscribe(handlers);
    server.channel('/state-ws').open();
    await flush();
    expect(of('state').at(-1)).toEqual(FILE);

    const corrupted = createMemoryStorage({ 'overlay:render-state': '{pas du json' });
    const second = recorder();
    createCachedTransport(transports.local(createFakeServer()), corrupted).subscribe(second.handlers);
    await flush();
    expect(second.of('state')).toEqual([]);
  });
});
