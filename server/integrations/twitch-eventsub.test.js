import { describe, expect, test } from 'bun:test';
import { EVENTSUB_URL, KEEPALIVE_MARGIN_MS, RECONNECT_DELAYS_MS, createEventSubSession, reconnectDelayMs } from './twitch-eventsub.js';

/** Une socket de test : elle garde ce qu'on lui envoie (jamais rien, c'est un des contrôles) et se laisse piloter. */
class FakeSocket {
  constructor(url) {
    this.url = url;
    this.listeners = { message: [], close: [], error: [] };
    this.sent = [];
    this.closed = false;
  }
  addEventListener(type, listener) { this.listeners[type].push(listener); }
  send(data) { this.sent.push(data); }
  close() { if (!this.closed) { this.closed = true; this.emit('close', {}); } }
  emit(type, event) { for (const listener of this.listeners[type]) listener(event); }
  receive(message) { this.emit('message', { data: JSON.stringify(message) }); }
}

const envelope = (type, payload = {}, extra = {}) => ({ metadata: { message_id: extra.id ?? `m-${Math.random()}`, message_type: type, message_timestamp: 'now', ...extra.metadata }, payload });
const welcome = (id = 'sess-1', keepalive = 10) => envelope('session_welcome', { session: { id, status: 'connected', keepalive_timeout_seconds: keepalive, reconnect_url: null } });
const notification = (subscriptionType, event, id) => envelope('notification', { event, subscription: { type: subscriptionType } }, { id, metadata: { subscription_type: subscriptionType, subscription_version: '1' } });

/** Un faux Twitch : les abonnements reçoivent les réponses scriptées (202 par défaut). */
function setup(options = {}) {
  const sockets = [];
  const timers = [];
  const alerts = [];
  const statuses = [];
  const requests = [];
  const answers = [...(options.answers ?? [])];
  let token = 'token-1';
  let creationFailures = options.createFails === true ? 1 : 0;
  const refreshes = [];
  const session = createEventSubSession({
    userId: '42',
    clientId: 'cid',
    getAccessToken: () => token,
    refreshAccessToken: async () => { refreshes.push(true); if (options.refreshOk) token = 'token-2'; return options.refreshOk === true; },
    onAlert: (alert) => alerts.push(alert),
    onStatus: (status) => statuses.push(status),
    createSocket: (url) => { if (creationFailures > 0) { creationFailures -= 1; throw new Error('refusé'); } const socket = new FakeSocket(url); sockets.push(socket); return socket; },
    apiUrl: 'https://api.test',
    fetchImpl: async (url, init) => {
      requests.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      const next = answers.shift() ?? { status: 202 };
      if (next instanceof Error) throw next;
      return new Response(JSON.stringify(next.body ?? {}), { status: next.status });
    },
    setTimer: (callback, delay) => { const timer = { callback, delay, cleared: false }; timers.push(timer); return timer; },
    clearTimer: (timer) => { timer.cleared = true; },
    log: () => {},
  });
  const live = () => timers.filter((timer) => !timer.cleared);
  const settle = async () => { for (let index = 0; index < 20; index += 1) await Promise.resolve(); await new Promise((resolve) => setTimeout(resolve, 0)); };
  const connected = async (id = 'sess-1') => { session.start(); sockets[0].receive(welcome(id)); await settle(); };
  return { session, sockets, timers, alerts, statuses, requests, refreshes, live, settle, connected, last: () => statuses.at(-1) };
}

describe('connexion et abonnements', () => {
  test('ouvre l’adresse officielle d’EventSub', () => {
    const { session, sockets } = setup();
    session.start();
    expect(sockets[0].url).toBe(EVENTSUB_URL);
    expect(EVENTSUB_URL).toBe('wss://eventsub.wss.twitch.tv/ws');
  });

  test('après l’accueil, crée les six abonnements avec le jeton utilisateur, l’identifiant client et la session', async () => {
    const { requests, connected, last } = setup();
    await connected('abc');
    expect(requests).toHaveLength(6);
    for (const request of requests) {
      expect(request.url).toBe('https://api.test/helix/eventsub/subscriptions');
      expect(request.headers).toEqual({ Authorization: 'Bearer token-1', 'Client-Id': 'cid', 'Content-Type': 'application/json' });
      expect(request.body.transport).toEqual({ method: 'websocket', session_id: 'abc' });
    }
    expect(requests.map((request) => request.body.type)).toEqual(['channel.follow', 'channel.subscribe', 'channel.subscription.message', 'channel.subscription.gift', 'channel.cheer', 'channel.raid']);
    expect(last()).toMatchObject({ state: 'connected', subscriptions: 6, needsLogin: false });
  });

  test('l’état passe par « connexion en cours » avant « connecté »', async () => {
    const { statuses, connected } = setup();
    await connected();
    expect(statuses.map((status) => status.state)).toEqual(['connecting', 'connected']);
  });

  test('un abonnement déjà existant (409) compte comme réussi', async () => {
    const { connected, last } = setup({ answers: [{ status: 409 }] });
    await connected();
    expect(last()).toMatchObject({ state: 'connected', subscriptions: 6 });
  });

  test('ne n’envoie jamais rien sur la socket (Twitch coupe tout trafic entrant, code 4001)', async () => {
    const { sockets, connected } = setup();
    await connected();
    sockets[0].receive(envelope('session_keepalive'));
    expect(sockets[0].sent).toEqual([]);
  });
});

describe('notifications', () => {
  test('une notification devient une alerte', async () => {
    const { sockets, alerts, connected } = setup();
    await connected();
    sockets[0].receive(notification('channel.raid', { from_broadcaster_user_name: 'Boss', viewers: 30 }, 'n1'));
    expect(alerts).toEqual([{ type: 'raid', username: 'Boss', amount: 30 }]);
  });

  test('le même message reçu deux fois ne fait qu’une alerte', async () => {
    const { sockets, alerts, connected } = setup();
    await connected();
    sockets[0].receive(notification('channel.follow', { user_name: 'A' }, 'dup'));
    sockets[0].receive(notification('channel.follow', { user_name: 'A' }, 'dup'));
    sockets[0].receive(notification('channel.follow', { user_name: 'B' }, 'autre'));
    expect(alerts.map((alert) => alert.username)).toEqual(['A', 'B']);
  });

  test('un abonnement offert reçu et un type inconnu n’alertent pas', async () => {
    const { sockets, alerts, connected } = setup();
    await connected();
    sockets[0].receive(notification('channel.subscribe', { user_name: 'X', is_gift: true }, 'g1'));
    sockets[0].receive(notification('channel.update', { title: 't' }, 'u1'));
    expect(alerts).toEqual([]);
  });

  test('un message illisible est ignoré sans casser la session', async () => {
    const { sockets, alerts, connected } = setup();
    await connected();
    sockets[0].emit('message', { data: 'pas du json' });
    sockets[0].receive(notification('channel.follow', { user_name: 'A' }, 'n1'));
    expect(alerts).toHaveLength(1);
  });

  test('l’historique de dédoublonnage est borné (les vieux identifiants sont oubliés)', async () => {
    const { sockets, alerts, connected } = setup();
    await connected();
    for (let index = 0; index < 250; index += 1) sockets[0].receive(notification('channel.follow', { user_name: `u${index}` }, `id${index}`));
    sockets[0].receive(notification('channel.follow', { user_name: 'rejoué' }, 'id0'));
    expect(alerts).toHaveLength(251);
  });
});

describe('surveillance et reconnexion', () => {
  test('sans aucun message dans le délai annoncé, la connexion est déclarée perdue et rouverte avec recul', async () => {
    const { sockets, live, last, connected, settle } = setup();
    await connected();
    const watchdog = live().at(-1);
    expect(watchdog.delay).toBe(10_000 + KEEPALIVE_MARGIN_MS);
    watchdog.callback();
    expect(last()).toMatchObject({ state: 'reconnecting' });
    expect(last().detail).toContain('2 s');
    expect(sockets[0].closed).toBe(true);
    live().at(-1).callback();
    await settle();
    expect(sockets).toHaveLength(2);
  });

  test('chaque message (keepalive, notification) réarme la surveillance', async () => {
    const { sockets, timers, connected } = setup();
    await connected();
    const before = timers.length;
    sockets[0].receive(envelope('session_keepalive'));
    sockets[0].receive(notification('channel.follow', { user_name: 'A' }, 'n1'));
    expect(timers.length).toBe(before + 2);
    expect(timers.filter((timer) => timer.cleared).length).toBeGreaterThanOrEqual(2);
  });

  test('le délai de keepalive annoncé par Twitch est respecté', async () => {
    const { sockets, live, session } = setup();
    session.start();
    sockets[0].receive(welcome('s', 30));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(live().at(-1).delay).toBe(30_000 + KEEPALIVE_MARGIN_MS);
  });

  test('une fermeture de la connexion rouvre avec des reculs croissants, puis repart de zéro après un succès', async () => {
    const { sockets, live, last, settle, session } = setup();
    session.start();
    for (const expected of [2000, 5000, 15000, 30000, 30000]) {
      sockets.at(-1).close();
      expect(last().detail).toContain(`${expected / 1000} s`);
      live().at(-1).callback();
    }
    sockets.at(-1).receive(welcome('ok'));
    await settle();
    expect(last().state).toBe('connected');
    sockets.at(-1).close();
    expect(last().detail).toContain('2 s');
  });

  test('les reculs sont ceux des autres clients locaux', () => {
    expect(RECONNECT_DELAYS_MS).toEqual([2000, 5000, 15000, 30000]);
    expect(reconnectDelayMs(0)).toBe(2000);
    expect(reconnectDelayMs(99)).toBe(30000);
  });

  test('une socket impossible à ouvrir se retente', () => {
    const { session, live, last, sockets } = setup({ createFails: true });
    session.start();
    expect(last().state).toBe('reconnecting');
    live().at(-1).callback();
    expect(sockets).toHaveLength(1);
  });
});

describe('reconnexion annoncée par Twitch', () => {
  async function reconnecting() {
    const context = setup();
    await context.connected('old');
    context.sockets[0].receive(envelope('session_reconnect', { session: { id: 'old', reconnect_url: 'wss://autre.test/ws?code=xyz' } }));
    return context;
  }

  test('ouvre l’adresse donnée telle quelle, et garde l’ancienne connexion jusqu’à l’accueil de la nouvelle', async () => {
    const { sockets } = await reconnecting();
    expect(sockets).toHaveLength(2);
    expect(sockets[1].url).toBe('wss://autre.test/ws?code=xyz');
    expect(sockets[0].closed).toBe(false);
  });

  test('à l’accueil de la nouvelle : l’ancienne est fermée, aucun nouvel abonnement, rien ne se rouvre', async () => {
    const { sockets, requests, last, settle, live } = await reconnecting();
    const timersBefore = live().length;
    sockets[1].receive(welcome('new'));
    await settle();
    expect(sockets[0].closed).toBe(true);
    expect(requests).toHaveLength(6);
    expect(last().state).toBe('connected');
    expect(sockets).toHaveLength(2);
    expect(live().length).toBeLessThanOrEqual(timersBefore + 1);
  });

  test('les alertes arrivent par la nouvelle connexion, pas de doublon avec l’ancienne', async () => {
    const { sockets, alerts, settle } = await reconnecting();
    sockets[0].receive(notification('channel.follow', { user_name: 'Pendant' }, 'p1'));
    sockets[1].receive(welcome('new'));
    await settle();
    sockets[0].receive(notification('channel.follow', { user_name: 'Ignoré' }, 'p2'));
    sockets[1].receive(notification('channel.follow', { user_name: 'Après' }, 'p3'));
    expect(alerts.map((alert) => alert.username)).toEqual(['Pendant', 'Après']);
  });

  test('si la connexion de reprise échoue avant son accueil, la principale reste en place', async () => {
    const { sockets, last } = await reconnecting();
    sockets[1].close();
    expect(sockets[0].closed).toBe(false);
    expect(last().state).toBe('connected');
  });

  test('une reprise demandée par une connexion qui n’est plus la principale est ignorée', async () => {
    const { sockets } = await reconnecting();
    sockets[1].receive(welcome('new'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    sockets[0].receive(envelope('session_reconnect', { session: { reconnect_url: 'wss://encore.test' } }));
    expect(sockets).toHaveLength(2);
  });
});

describe('autorisation et échecs d’abonnement', () => {
  test('401 puis jeton rafraîchi : l’abonnement est retenté avec le jeton neuf', async () => {
    const { requests, refreshes, last, connected } = setup({ answers: [{ status: 401, body: { message: 'Invalid OAuth token' } }], refreshOk: true });
    await connected();
    expect(refreshes).toHaveLength(1);
    expect(requests[0].headers.Authorization).toBe('Bearer token-1');
    expect(requests[1].headers.Authorization).toBe('Bearer token-2');
    expect(last()).toMatchObject({ state: 'connected', subscriptions: 6 });
  });

  test('401 sans rafraîchissement possible : arrêt net, reconnexion demandée, aucune boucle', async () => {
    const { last, live, sockets, connected } = setup({ answers: [{ status: 401, body: { message: 'Invalid OAuth token' } }], refreshOk: false });
    await connected();
    expect(last()).toMatchObject({ state: 'error', needsLogin: true });
    expect(last().detail).toContain('reconnectez Twitch');
    expect(sockets[0].closed).toBe(true);
    expect(live().filter((timer) => timer.delay >= 2000 && timer.delay <= 30000 && timer.delay !== 13000)).toEqual([]);
  });

  test('un seul rafraîchissement par ouverture de session, même si Twitch refuse encore', async () => {
    const { refreshes, last, connected } = setup({ answers: [{ status: 401 }, { status: 401 }], refreshOk: true });
    await connected();
    expect(refreshes).toHaveLength(1);
    expect(last()).toMatchObject({ state: 'error', needsLogin: true });
  });

  test('un second refus plus tard dans la même ouverture ne relance pas un rafraîchissement : on s’arrête', async () => {
    const { refreshes, last, connected } = setup({ answers: [{ status: 401 }, { status: 202 }, { status: 401 }], refreshOk: true });
    await connected();
    expect(refreshes).toHaveLength(1);
    expect(last()).toMatchObject({ state: 'error', needsLogin: true });
  });

  test('403 : portée manquante, dit avec le type d’abonnement concerné', async () => {
    const { last, connected } = setup({ answers: [{ status: 202 }, { status: 403, body: { message: 'subscription missing proper authorization' } }] });
    await connected();
    expect(last()).toMatchObject({ state: 'error', needsLogin: true });
    expect(last().detail).toContain('channel.subscribe');
    expect(last().detail).toContain('subscription missing proper authorization');
  });

  test('429, 500 ou réseau coupé : passager, la session se rouvre avec recul', async () => {
    for (const answer of [{ status: 429, body: { message: 'Too Many Requests' } }, { status: 500 }, new Error('coupé')]) {
      const { last, connected, sockets } = setup({ answers: [answer] });
      await connected();
      expect(last().state).toBe('reconnecting');
      expect(last().needsLogin).toBe(false);
      expect(sockets[0].closed).toBe(true);
    }
  });
});

describe('révocation', () => {
  test('l’autorisation retirée sur Twitch arrête la session et demande de se reconnecter', async () => {
    const { sockets, last, connected } = setup();
    await connected();
    sockets[0].receive(envelope('revocation', { subscription: { type: 'channel.follow', status: 'authorization_revoked' } }));
    expect(last()).toMatchObject({ state: 'error', needsLogin: true });
    expect(last().detail).toContain('authorization_revoked');
    expect(sockets[0].closed).toBe(true);
  });

  test('un abonnement révoqué pour une autre raison est signalé, la session continue', async () => {
    const { sockets, last, connected, alerts } = setup();
    await connected();
    sockets[0].receive(envelope('revocation', { subscription: { type: 'channel.cheer', status: 'version_removed' } }));
    expect(last()).toMatchObject({ state: 'connected', subscriptions: 5 });
    expect(last().detail).toContain('channel.cheer');
    sockets[0].receive(notification('channel.follow', { user_name: 'A' }, 'n1'));
    expect(alerts).toHaveLength(1);
  });
});

describe('arrêt', () => {
  test('stop ferme tout, coupe les minuteurs et ignore ce qui arrive ensuite', async () => {
    const { session, sockets, alerts, live, connected } = setup();
    await connected();
    session.stop();
    expect(sockets[0].closed).toBe(true);
    expect(live()).toEqual([]);
    sockets[0].receive(notification('channel.follow', { user_name: 'A' }, 'n1'));
    expect(alerts).toEqual([]);
  });

  test('après stop, une fermeture ne rouvre rien', async () => {
    const { session, sockets, live, connected } = setup();
    await connected();
    session.stop();
    sockets[0].close();
    expect(live()).toEqual([]);
    expect(sockets).toHaveLength(1);
  });

  test('stop pendant un recul annule la réouverture', () => {
    const { session, sockets, live } = setup();
    session.start();
    sockets[0].close();
    expect(live().length).toBeGreaterThan(0);
    session.stop();
    expect(live()).toEqual([]);
  });

  test('on peut redémarrer après un arrêt', async () => {
    const { session, sockets, last, settle } = setup();
    session.start();
    session.stop();
    session.start();
    expect(sockets).toHaveLength(2);
    sockets[1].receive(welcome('again'));
    await settle();
    expect(last().state).toBe('connected');
  });
});
