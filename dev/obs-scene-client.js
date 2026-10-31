// @ts-check
import { computeObsAuthResponse } from '../obs-auth.js';

/**
 * dev/obs-scene-client.js — Client OBS WebSocket v5 en lecture seule.
 *
 * Périmètre volontairement étroit (③, docs/specs/obs-scene-preset-mapping.md) : identification, écoute de
 * `CurrentProgramSceneChanged` et requêtes de lecture (`request`, utilisées par le diagnostic). Aucune écriture vers OBS :
 * `request` refuse tout type qui ne commence pas par `Get`.
 *
 * Ne démarre que si un mot de passe est fourni — sans lui, le serveur d'état se comporte comme
 * avant ③. OBS fermé n'est jamais une erreur : on retente, l'écran ne bouge pas.
 */

const OBS_OPCODE = { HELLO: 0, IDENTIFY: 1, IDENTIFIED: 2, EVENT: 5, REQUEST: 6, REQUEST_RESPONSE: 7 };

/** Abonnement aux seuls événements de scène (bitmask officiel `EventSubscription.Scenes`). */
const SCENES_EVENT_SUBSCRIPTION = 1 << 2;

/** Délai au-delà duquel une requête sans réponse est abandonnée. */
export const REQUEST_TIMEOUT_MS = 3000;

/** Mêmes reculs que la session audio — un service local absent se retente sans s'acharner. */
export const RECONNECT_DELAYS_MS = [2000, 5000, 15000, 30000];

/** @param {number} attempt */
export function reconnectDelayMs(attempt) {
  return RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
}

/**
 * @param {{
 *   url: string,
 *   password: string,
 *   onSceneChange: (sceneName: string) => void,
 *   onScenes?: (sceneNames: string[]) => void,
 *   onActiveScene?: (sceneName: string) => void,
 *   onStatus?: (status: { connected: boolean, reason: string | null }) => void,
 *   createSocket?: (url: string) => WebSocket,
 *   requestTimeoutMs?: number,
 *   scheduleReconnect?: (callback: () => void, delayMs: number) => void,
 *   log?: (message: string) => void,
 * }} deps
 */
export function createObsSceneClient(deps) {
  const createSocket = deps.createSocket ?? ((url) => new WebSocket(url));
  const scheduleReconnect = deps.scheduleReconnect ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const log = deps.log ?? ((message) => console.info(`[obs-scene-client] ${message}`));

  /** @type {WebSocket | null} */
  let socket = null;
  let attempt = 0;
  let stopped = false;
  // Un mot de passe refusé ne se répare pas tout seul : réessayer en boucle noierait la seule
  // trace utile dans les logs du live.
  let authRejected = false;
  let requestCounter = 0;
  let identified = false;
  /** @type {Map<string, { resolve: (data: any) => void, reject: (error: Error) => void, timer: any }>} */
  const pending = new Map();

  /** @param {Error} error */
  function failPending(error) {
    for (const [id, waiting] of pending) {
      clearTimeout(waiting.timer);
      waiting.reject(error);
      pending.delete(id);
    }
  }

  /** @param {boolean} connected @param {string | null} [reason] */
  function publish(connected, reason = null) {
    deps.onStatus?.({ connected, reason });
  }

  /** @param {string} reason */
  function planReconnect(reason) {
    if (stopped || authRejected) return;
    const delay = reconnectDelayMs(attempt);
    attempt += 1;
    scheduleReconnect(connect, delay);
    publish(false, reason);
  }

  function requestSceneList() {
    socket?.send(JSON.stringify({
      op: OBS_OPCODE.REQUEST,
      d: { requestType: 'GetSceneList', requestId: 'scene-list', requestData: {} },
    }));
  }

  /** @param {unknown} raw */
  async function handleMessage(raw) {
    /** @type {any} */
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (message.op === OBS_OPCODE.HELLO) {
      const challenge = message.d?.authentication;
      /** @type {any} */
      const identify = {
        rpcVersion: message.d?.rpcVersion ?? 1,
        eventSubscriptions: SCENES_EVENT_SUBSCRIPTION,
      };
      if (challenge) {
        identify.authentication = await computeObsAuthResponse({
          password: deps.password,
          salt: challenge.salt,
          challenge: challenge.challenge,
        });
      }
      socket?.send(JSON.stringify({ op: OBS_OPCODE.IDENTIFY, d: identify }));
      return;
    }

    if (message.op === OBS_OPCODE.IDENTIFIED) {
      attempt = 0;
      identified = true;
      publish(true);
      log('connecté à OBS — écoute des changements de scène');
      requestSceneList();
      return;
    }

    if (message.op === OBS_OPCODE.REQUEST_RESPONSE && pending.has(message.d?.requestId)) {
      const waiting = /** @type {NonNullable<ReturnType<typeof pending.get>>} */ (pending.get(message.d.requestId));
      pending.delete(message.d.requestId);
      clearTimeout(waiting.timer);
      if (message.d?.requestStatus?.result === false) waiting.reject(new Error(message.d.requestStatus.comment ?? `requête refusée (${message.d.requestStatus.code})`));
      else waiting.resolve(message.d?.responseData ?? {});
      return;
    }

    if (message.op === OBS_OPCODE.REQUEST_RESPONSE && message.d?.requestId === 'scene-list') {
      const scenes = message.d?.responseData?.scenes;
      if (Array.isArray(scenes)) {
        deps.onScenes?.(scenes.map((scene) => scene?.sceneName).filter((name) => typeof name === 'string'));
      }
      const active = message.d?.responseData?.currentProgramSceneName;
      if (typeof active === 'string') deps.onActiveScene?.(active);
      return;
    }

    if (message.op === OBS_OPCODE.EVENT && message.d?.eventType === 'CurrentProgramSceneChanged') {
      const sceneName = message.d?.eventData?.sceneName;
      if (typeof sceneName === 'string') deps.onSceneChange(sceneName);
    }
  }

  function connect() {
    if (stopped || authRejected) return;
    try {
      socket = createSocket(deps.url);
    } catch {
      planReconnect('unreachable');
      return;
    }

    socket.addEventListener('message', (event) => { handleMessage(event.data); });
    socket.addEventListener('close', (event) => {
      socket = null;
      identified = false;
      failPending(new Error('connexion OBS fermée'));
      // 4009 = authentification refusée (obs-websocket v5).
      if (/** @type {*} */ (event)?.code === 4009) {
        authRejected = true;
        publish(false, 'auth-rejected');
        log('mot de passe refusé par OBS — corrige OBS_WS_PASSWORD puis relance le serveur');
        return;
      }
      planReconnect('closed');
    });
    socket.addEventListener('error', () => {
      // 'close' suit toujours 'error' : tout le traitement y est fait, une seule fois.
    });
  }

  connect();

  return {
    /**
     * Requête de lecture vers OBS (`GetVersion`, `GetSceneItemList`…). Rejette hors connexion, sur refus d'OBS et
     * au-delà de `requestTimeoutMs` ; une écriture est refusée avant tout envoi.
     * @param {string} requestType
     * @param {Record<string, unknown>} [requestData]
     * @returns {Promise<any>}
     */
    request(requestType, requestData = {}) {
      if (!requestType.startsWith('Get')) return Promise.reject(new Error(`requête d'écriture refusée : ${requestType}`));
      if (socket === null || !identified) return Promise.reject(new Error('OBS non connecté'));
      requestCounter += 1;
      const requestId = `req-${requestCounter}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error(`OBS n'a pas répondu à ${requestType}`));
        }, deps.requestTimeoutMs ?? REQUEST_TIMEOUT_MS);
        pending.set(requestId, { resolve, reject, timer });
        socket?.send(JSON.stringify({ op: OBS_OPCODE.REQUEST, d: { requestType, requestId, requestData } }));
      });
    },
    stop() {
      stopped = true;
      failPending(new Error('client OBS arrêté'));
      socket?.close();
      socket = null;
    },
  };
}
