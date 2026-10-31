// @ts-check
import { alertFromNotification, subscriptionsFor } from './twitch-alerts.js';
import { errorMessage } from './error-message.js';

/**
 * dev/twitch-eventsub.js — Une session Twitch EventSub par **WebSocket** (aucun serveur public, aucune adresse de rappel).
 *
 * Cycle (documentation Twitch, EventSub WebSocket) :
 *   1. connexion à `wss://eventsub.wss.twitch.tv/ws` → `session_welcome` (identifiant de session, délai de keepalive) ;
 *   2. **dans les 10 secondes**, un `POST /helix/eventsub/subscriptions` par type (jeton **utilisateur** obligatoire, jamais celui de l'application) ;
 *   3. `notification` → alerte ; `session_keepalive` rassure ; sans aucun message pendant le délai annoncé, la connexion est considérée perdue
 *      (les abonnements d'une session coupée sont désactivés : nouvelle session, nouveaux abonnements, les événements manqués ne sont pas rejoués) ;
 *   4. `session_reconnect` (environ 30 s avant une coupure voulue par Twitch) : se connecter à l'adresse donnée **telle quelle**, garder l'ancienne
 *      connexion ouverte jusqu'au `session_welcome` de la nouvelle (les abonnements suivent, aucun événement n'est perdu), puis fermer l'ancienne ;
 *   5. `revocation` : un abonnement retiré (autorisation retirée sur Twitch) — on le dit, la reconnexion de l'owner est nécessaire.
 * Le client n'envoie jamais rien sur la socket (Twitch ferme sur 4001 tout trafic entrant) : le protocole ping/pong est celui du navigateur.
 *
 * Une même notification peut arriver deux fois (reconnexion) : l'identifiant du message sert à dédoublonner.
 * Les échecs réseau se retentent (reculs 2, 5, 15, 30 s) ; un refus d'autorisation (401, 403) ne se répare pas seul : la session s'arrête et le dit.
 * Le réseau, les temporisations et la socket sont injectés (essais sans Twitch, voir `dev/twitch-eventsub.test.js`).
 *
 * @typedef {{ state: 'connecting' | 'connected' | 'reconnecting' | 'error', detail: string | null, subscriptions: number, needsLogin: boolean }} EventSubStatus
 */

export const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws';
export const API_URL = 'https://api.twitch.tv';
export const RECONNECT_DELAYS_MS = [2000, 5000, 15000, 30000];
/** Marge au-delà du délai de keepalive annoncé avant de déclarer la connexion perdue. */
export const KEEPALIVE_MARGIN_MS = 3000;
const DEDUPE_SIZE = 200;

/** @param {number} attempt */
export const reconnectDelayMs = (attempt) => RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];

/**
 * @param {{
 *   userId: string,
 *   clientId: string,
 *   getAccessToken: () => string,
 *   refreshAccessToken: () => Promise<boolean>,
 *   onAlert: (alert: import('./alert-event.js').Alert) => void,
 *   onStatus?: (status: EventSubStatus) => void,
 *   url?: string,
 *   apiUrl?: string,
 *   createSocket?: (url: string) => WebSocket,
 *   fetchImpl?: typeof fetch,
 *   setTimer?: (callback: () => void, delayMs: number) => unknown,
 *   clearTimer?: (handle: unknown) => void,
 *   log?: (message: string) => void,
 * }} deps
 */
export function createEventSubSession(deps) {
  const createSocket = deps.createSocket ?? ((url) => new WebSocket(url));
  const fetchImpl = deps.fetchImpl ?? ((...args) => fetch(...args));
  const setTimer = deps.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(/** @type {*} */ (handle)));
  const log = deps.log ?? ((message) => console.info(`[twitch-eventsub] ${message}`));
  const apiUrl = (deps.apiUrl ?? API_URL).replace(/\/$/, '');

  /** @typedef {{ socket: WebSocket, sessionId: string | null, keepaliveMs: number, watchdog: unknown, replaced: boolean, dead: boolean }} Connection */
  /** @type {Connection | null} */
  let primary = null;
  let stopped = false;
  let attempt = 0;
  /** @type {unknown} */
  let reconnectTimer = null;
  /** @type {string[]} */
  const seen = [];
  /** @type {EventSubStatus} */
  let status = { state: 'connecting', detail: null, subscriptions: 0, needsLogin: false };

  /** @param {Partial<EventSubStatus>} patch */
  function publish(patch) {
    status = { ...status, ...patch };
    deps.onStatus?.(status);
  }

  /** @param {Connection} conn */
  function armWatchdog(conn) {
    if (conn.watchdog !== null) clearTimer(conn.watchdog);
    conn.watchdog = setTimer(() => {
      if (conn.dead || stopped) return;
      log(`aucun message depuis ${Math.round(conn.keepaliveMs / 1000)} s : connexion perdue`);
      lost(conn, 'aucun message de Twitch dans le délai annoncé');
    }, conn.keepaliveMs);
  }

  /** @param {Connection} conn */
  function retire(conn) {
    conn.dead = true;
    if (conn.watchdog !== null) clearTimer(conn.watchdog);
    conn.watchdog = null;
    try { conn.socket.close(); } catch { /* déjà fermée */ }
  }

  /** La connexion principale est perdue : on en rouvre une neuve, avec recul. @param {Connection} conn @param {string} reason */
  function lost(conn, reason) {
    retire(conn);
    if (stopped || conn.replaced || conn !== primary) return;
    primary = null;
    const delay = reconnectDelayMs(attempt);
    attempt += 1;
    publish({ state: 'reconnecting', detail: `${reason} — nouvelle tentative dans ${Math.round(delay / 1000)} s`, subscriptions: 0 });
    reconnectTimer = setTimer(() => { reconnectTimer = null; open(deps.url ?? EVENTSUB_URL, false); }, delay);
  }

  /** @param {string} token @param {{ type: string, version: string, condition: Record<string, string> }} subscription @param {string} sessionId */
  async function post(token, subscription, sessionId) {
    let response;
    try {
      response = await fetchImpl(`${apiUrl}/helix/eventsub/subscriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Client-Id': deps.clientId, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...subscription, transport: { method: 'websocket', session_id: sessionId } }),
      });
    } catch (error) {
      return { kind: /** @type {const} */ ('network'), message: errorMessage(error) };
    }
    if (response.status === 202 || response.status === 409) return { kind: /** @type {const} */ ('ok') };
    /** @type {string} */
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body?.message === 'string') message = body.message;
    } catch { /* corps illisible */ }
    if (response.status === 401) return { kind: /** @type {const} */ ('unauthorized'), message };
    if (response.status === 403) return { kind: /** @type {const} */ ('forbidden'), message };
    return { kind: /** @type {const} */ ('error'), message };
  }

  /** @param {Connection} conn */
  async function subscribeAll(conn) {
    const wanted = subscriptionsFor(deps.userId);
    let done = 0;
    let refreshed = false;
    for (const subscription of wanted) {
      let result = await post(deps.getAccessToken(), subscription, /** @type {string} */ (conn.sessionId));
      if (result.kind === 'unauthorized' && !refreshed) {
        refreshed = true;
        if (await deps.refreshAccessToken()) result = await post(deps.getAccessToken(), subscription, /** @type {string} */ (conn.sessionId));
      }
      if (conn.dead || stopped) return;
      if (result.kind === 'ok') {
        done += 1;
        continue;
      }
      if (result.kind === 'unauthorized' || result.kind === 'forbidden') {
        const detail = result.kind === 'forbidden'
          ? `Twitch refuse l’abonnement ${subscription.type} (${result.message}) : reconnectez Twitch pour accorder toutes les autorisations`
          : `Twitch refuse le jeton (${result.message}) : reconnectez Twitch`;
        log(detail);
        retire(conn);
        primary = null;
        stopped = true;
        publish({ state: 'error', detail, subscriptions: 0, needsLogin: true });
        return;
      }
      log(`abonnement ${subscription.type} impossible : ${result.message}`);
      lost(conn, `abonnement ${subscription.type} impossible (${result.message})`);
      return;
    }
    attempt = 0;
    publish({ state: 'connected', detail: null, subscriptions: done, needsLogin: false });
    log(`connecté — ${done} abonnements`);
  }

  /** @param {string} id @returns {boolean} vrai si déjà vu */
  function alreadySeen(id) {
    if (seen.includes(id)) return true;
    seen.push(id);
    if (seen.length > DEDUPE_SIZE) seen.shift();
    return false;
  }

  /**
   * @param {Connection} conn
   * @param {boolean} switching cette connexion remplace la principale (reconnexion annoncée par Twitch)
   * @param {unknown} raw
   */
  async function onMessage(conn, switching, raw) {
    if (conn.dead || stopped) return;
    /** @type {any} */
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    const type = message?.metadata?.message_type;
    if (type === 'session_welcome') {
      const session = message.payload?.session;
      if (typeof session?.id !== 'string') return;
      conn.sessionId = session.id;
      conn.keepaliveMs = (typeof session.keepalive_timeout_seconds === 'number' ? session.keepalive_timeout_seconds : 10) * 1000 + KEEPALIVE_MARGIN_MS;
      armWatchdog(conn);
      if (switching) {
        const old = primary;
        primary = conn;
        if (old !== null) {
          old.replaced = true;
          retire(old);
        }
        log('reconnexion annoncée par Twitch : session reprise sans perte');
        return;
      }
      primary = conn;
      await subscribeAll(conn);
      return;
    }
    if (type === 'session_keepalive') {
      armWatchdog(conn);
      return;
    }
    if (type === 'notification') {
      armWatchdog(conn);
      const id = message.metadata?.message_id;
      if (typeof id === 'string' && alreadySeen(id)) return;
      const alert = alertFromNotification(String(message.metadata?.subscription_type), message.payload?.event);
      if (alert !== null) deps.onAlert(alert);
      return;
    }
    if (type === 'session_reconnect') {
      armWatchdog(conn);
      const target = message.payload?.session?.reconnect_url;
      if (typeof target === 'string' && conn === primary) open(target, true);
      return;
    }
    if (type === 'revocation') {
      const subscriptionType = String(message.payload?.subscription?.type ?? 'abonnement');
      const reason = String(message.payload?.subscription?.status ?? 'révoqué');
      log(`${subscriptionType} révoqué par Twitch (${reason})`);
      if (reason === 'authorization_revoked' || reason === 'user_removed') {
        retire(conn);
        primary = null;
        stopped = true;
        publish({ state: 'error', detail: `l’autorisation a été retirée sur Twitch (${reason}) : reconnectez Twitch`, subscriptions: 0, needsLogin: true });
      } else {
        publish({ detail: `${subscriptionType} révoqué par Twitch (${reason})`, subscriptions: Math.max(0, status.subscriptions - 1) });
      }
    }
  }

  /** @param {string} target @param {boolean} switching */
  function open(target, switching) {
    if (stopped) return;
    /** @type {WebSocket} */
    let socket;
    try {
      socket = createSocket(target);
    } catch (error) {
      if (!switching) {
        const conn = /** @type {Connection} */ ({ socket: /** @type {*} */ ({ close() {} }), sessionId: null, keepaliveMs: 0, watchdog: null, replaced: false, dead: false });
        primary = conn;
        lost(conn, `connexion impossible : ${errorMessage(error)}`);
      }
      return;
    }
    /** @type {Connection} */
    const conn = { socket, sessionId: null, keepaliveMs: (10 * 1000) + KEEPALIVE_MARGIN_MS, watchdog: null, replaced: false, dead: false };
    if (!switching) primary = conn;
    armWatchdog(conn);
    socket.addEventListener('message', (event) => { void onMessage(conn, switching, event.data); });
    socket.addEventListener('close', () => {
      if (conn.dead) return;
      // Une connexion de reprise qui échoue avant son accueil laisse la principale en place : Twitch la fermera (4004) et la reconnexion normale prendra le relais.
      if (conn !== primary) {
        conn.dead = true;
        if (conn.watchdog !== null) clearTimer(conn.watchdog);
        return;
      }
      lost(conn, 'connexion à Twitch fermée');
    });
    socket.addEventListener('error', () => { /* `close` suit toujours : tout le traitement y est fait, une seule fois */ });
  }

  return {
    start() {
      stopped = false;
      attempt = 0;
      publish({ state: 'connecting', detail: null, subscriptions: 0, needsLogin: false });
      open(deps.url ?? EVENTSUB_URL, false);
    },
    stop() {
      stopped = true;
      if (reconnectTimer !== null) clearTimer(reconnectTimer);
      reconnectTimer = null;
      if (primary !== null) retire(primary);
      primary = null;
    },
    status: () => status,
  };
}
