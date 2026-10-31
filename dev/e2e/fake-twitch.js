// @ts-check
/**
 * dev/e2e/fake-twitch.js — Un faux Twitch pour les essais : autorisation par code d'appareil, jetons, EventSub par WebSocket. Il applique les
 * règles que la documentation de Twitch énonce (jeton de rafraîchissement à usage unique, jeton **utilisateur** exigé, portées par type
 * d'abonnement, abonnements liés à la session, reprise de session par `session_reconnect`) : un défaut du Studio qui les enfreindrait fait
 * échouer l'essai, ce qu'une façade complaisante ne ferait pas. Il ne prouve pas que le vrai Twitch se comporte ainsi : c'est la procédure de
 * l'owner (`docs/procedures-owner.md`) qui le vérifie.
 *
 * Port attribué par le système. Les trois adresses (`idUrl`, `apiUrl`, `eventSubUrl`) se passent au serveur d'état par l'environnement.
 */

export const FAKE_CLIENT_ID = 'fakeclientid0123456789abcdefgh';
export const FAKE_USER = { id: '42', login: 'mozaik' };

const REQUIRED_SCOPE = {
  'channel.follow': 'moderator:read:followers',
  'channel.subscribe': 'channel:read:subscriptions',
  'channel.subscription.message': 'channel:read:subscriptions',
  'channel.subscription.gift': 'channel:read:subscriptions',
  'channel.cheer': 'bits:read',
  'channel.raid': null,
};

/** @param {{ expiresIn?: number, grantedScopes?: string[], authorizeAfterPolls?: number }} [options] */
export function startFakeTwitch({ expiresIn = 14400, grantedScopes = ['moderator:read:followers', 'channel:read:subscriptions', 'bits:read'], authorizeAfterPolls = 1 } = {}) {
  let authorized = false;
  let polls = 0;
  let counter = 0;
  const log = {
    deviceRequests: /** @type {Record<string, string>[]} */ ([]),
    refreshes: /** @type {Record<string, string>[]} */ ([]),
    revoked: /** @type {string[]} */ ([]),
    subscriptions: /** @type {{ sessionId: string, type: string, version: string, condition: Record<string, string>, token: string, clientId: string | null }[]} */ ([]),
    rejectedSubscriptions: /** @type {{ status: number, type: string }[]} */ ([]),
    /** Connexions WebSocket ouvertes depuis le départ (une tentative de reconnexion en ajoute une). */
    socketsOpened: 0,
  };
  /** @type {Set<string>} */
  const validAccess = new Set();
  /** @type {Set<string>} */
  const validRefresh = new Set();
  /** @type {Map<string, any>} */
  const sockets = new Map();
  let sessionCounter = 0;
  /** @type {Set<string>} les sessions qui ont été accueillies */
  const sessions = new Set();

  const issue = () => {
    counter += 1;
    const access = `AT-${counter}`;
    const refresh = `RT-${counter}`;
    validAccess.add(access);
    validRefresh.add(refresh);
    return { access_token: access, refresh_token: refresh, expires_in: expiresIn, scope: grantedScopes, token_type: 'bearer' };
  };
  /** @param {string | null} header */
  const bearer = (header) => (header ?? '').replace(/^(Bearer|OAuth) /, '');
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === '/ws') {
        const reconnecting = url.searchParams.get('reconnect');
        return srv.upgrade(req, { data: { reconnecting } }) ? undefined : new Response('ws', { status: 426 });
      }
      if (url.pathname === '/oauth2/device' && req.method === 'POST') {
        const form = Object.fromEntries(new URLSearchParams(await req.text()));
        log.deviceRequests.push(form);
        if (form.client_id !== FAKE_CLIENT_ID) return json({ status: 400, message: 'invalid client' }, 400);
        return json({ device_code: 'DEVICE-CODE', user_code: 'WDJB-MJHT', verification_uri: `http://127.0.0.1:${server.port}/activate`, expires_in: 1800, interval: 1 });
      }
      if (url.pathname === '/oauth2/token' && req.method === 'POST') {
        const form = Object.fromEntries(new URLSearchParams(await req.text()));
        if (form.client_id !== FAKE_CLIENT_ID) return json({ status: 400, message: 'invalid client' }, 400);
        if (form.grant_type === 'urn:ietf:params:oauth:grant-type:device_code') {
          if (form.device_code !== 'DEVICE-CODE') return json({ status: 400, message: 'invalid device code' }, 400);
          polls += 1;
          if (!authorized || polls <= authorizeAfterPolls - 1) return json({ status: 400, message: 'authorization_pending' }, 400);
          return json(issue());
        }
        if (form.grant_type === 'refresh_token') {
          log.refreshes.push(form);
          if ('client_secret' in form) return json({ status: 400, message: 'client_secret inattendu pour un client public' }, 400);
          if (!validRefresh.has(form.refresh_token)) return json({ status: 400, message: 'Invalid refresh token' }, 400);
          validRefresh.delete(form.refresh_token);
          return json(issue());
        }
        return json({ status: 400, message: 'unsupported grant_type' }, 400);
      }
      if (url.pathname === '/oauth2/validate') {
        const token = bearer(req.headers.get('authorization'));
        if (!validAccess.has(token)) return json({ status: 401, message: 'invalid access token' }, 401);
        return json({ client_id: FAKE_CLIENT_ID, login: FAKE_USER.login, user_id: FAKE_USER.id, scopes: grantedScopes, expires_in: expiresIn });
      }
      if (url.pathname === '/oauth2/revoke' && req.method === 'POST') {
        const form = Object.fromEntries(new URLSearchParams(await req.text()));
        log.revoked.push(form.token);
        validAccess.delete(form.token);
        return json({}, 200);
      }
      if (url.pathname === '/helix/eventsub/subscriptions' && req.method === 'POST') {
        const token = bearer(req.headers.get('authorization'));
        const body = /** @type {*} */ (await req.json());
        if (!validAccess.has(token)) { log.rejectedSubscriptions.push({ status: 401, type: body.type }); return json({ status: 401, message: 'Invalid OAuth token' }, 401); }
        if (req.headers.get('client-id') !== FAKE_CLIENT_ID) { log.rejectedSubscriptions.push({ status: 401, type: body.type }); return json({ status: 401, message: 'Client-Id manquant' }, 401); }
        if (body.transport?.method !== 'websocket' || !sessions.has(body.transport?.session_id)) return json({ status: 400, message: 'session inconnue' }, 400);
        const scope = /** @type {Record<string, string | null>} */ (REQUIRED_SCOPE)[body.type];
        if (scope === undefined) return json({ status: 400, message: 'type inconnu' }, 400);
        if (scope !== null && !grantedScopes.includes(scope)) { log.rejectedSubscriptions.push({ status: 403, type: body.type }); return json({ status: 403, message: 'subscription missing proper authorization' }, 403); }
        log.subscriptions.push({ sessionId: body.transport.session_id, type: body.type, version: body.version, condition: body.condition, token, clientId: req.headers.get('client-id') });
        return json({ data: [{ id: `sub-${log.subscriptions.length}`, status: 'enabled', type: body.type, version: body.version, condition: body.condition, cost: 0 }], total: log.subscriptions.length, total_cost: 0, max_total_cost: 10 }, 202);
      }
      return new Response('not found', { status: 404 });
    },
    websocket: {
      open(ws) {
        log.socketsOpened += 1;
        const reuse = /** @type {string | null} */ (ws.data.reconnecting);
        sessionCounter += 1;
        const id = reuse ?? `session-${sessionCounter}`;
        ws.data.sessionId = id;
        sockets.set(`${id}#${sessionCounter}`, ws);
        sessions.add(id);
        ws.send(JSON.stringify({ metadata: { message_id: `w${sessionCounter}`, message_type: 'session_welcome', message_timestamp: new Date().toISOString() }, payload: { session: { id, status: 'connected', connected_at: new Date().toISOString(), keepalive_timeout_seconds: 10, reconnect_url: null } } }));
      },
      message() {
        // Un client EventSub ne doit rien envoyer : Twitch ferme sur 4001.
        for (const ws of sockets.values()) ws.close(4001, 'Client sent inbound traffic');
      },
      close(ws) {
        for (const [key, value] of sockets) if (value === ws) sockets.delete(key);
      },
    },
  });

  const base = `http://127.0.0.1:${server.port}`;
  const send = (ws, type, payload, extra = {}) => { counter += 1; ws.send(JSON.stringify({ metadata: { message_id: extra.id ?? `m${counter}`, message_type: type, message_timestamp: new Date().toISOString(), ...(extra.metadata ?? {}) }, payload })); };

  return {
    idUrl: base,
    apiUrl: base,
    eventSubUrl: `ws://127.0.0.1:${server.port}/ws`,
    log,
    /** L'owner a tapé le code et autorisé. */
    authorize() { authorized = true; },
    /** Des jetons déjà accordés (une installation qui s'était connectée avant le démarrage du serveur). */
    grant() { return issue(); },
    get accessTokens() { return [...validAccess]; },
    get connections() { return sockets.size; },
    /** @param {string} type @param {Record<string, unknown>} event @param {string} [id] */
    notify(type, event, id) {
      for (const ws of sockets.values()) {
        const subscribed = log.subscriptions.some((entry) => entry.sessionId === ws.data.sessionId && entry.type === type);
        if (subscribed) send(ws, 'notification', { subscription: { type, version: '1' }, event }, { id, metadata: { subscription_type: type, subscription_version: '1' } });
      }
    },
    /** Le jeton d'accès courant cesse de valoir (échéance, révocation) ; le jeton de rafraîchissement reste bon. */
    expireAccessTokens() { validAccess.clear(); },
    /** La connexion réseau tombe : toutes les sockets sont coupées. Les abonnements de ces sessions sont perdus, comme chez Twitch. */
    dropConnections() { for (const ws of [...sockets.values()]) ws.close(1006, 'réseau'); },
    /** Twitch annonce une reprise : la nouvelle connexion garde la session ; l'ancienne est fermée peu après. */
    announceReconnect() {
      for (const ws of sockets.values()) send(ws, 'session_reconnect', { session: { id: ws.data.sessionId, status: 'reconnecting', reconnect_url: `ws://127.0.0.1:${server.port}/ws?reconnect=${ws.data.sessionId}` } });
      const old = [...sockets.values()];
      setTimeout(() => { for (const ws of old) ws.close(4004, 'Reconnect grace time expired'); }, 600);
    },
    /** L'owner retire l'autorisation sur Twitch. */
    revokeAuthorization() {
      for (const ws of sockets.values()) send(ws, 'revocation', { subscription: { type: 'channel.follow', status: 'authorization_revoked' } });
      validAccess.clear();
      validRefresh.clear();
    },
    stop() { server.stop(true); },
  };
}
