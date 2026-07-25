// @ts-check
import { computeObsAuthResponse } from '../obs-auth.js';

/**
 * dev/obs-scene-client.js — Client OBS WebSocket v5 en lecture seule.
 *
 * Périmètre volontairement étroit (③, docs/specs/obs-scene-preset-mapping.md) : identification,
 * liste des scènes, et écoute de `CurrentProgramSceneChanged`. Aucune écriture vers OBS.
 *
 * Ne démarre que si un mot de passe est fourni — sans lui, le serveur d'état se comporte comme
 * avant ③. OBS fermé n'est jamais une erreur : on retente, l'écran ne bouge pas.
 */

const OBS_OPCODE = { HELLO: 0, IDENTIFY: 1, IDENTIFIED: 2, EVENT: 5, REQUEST: 6, REQUEST_RESPONSE: 7 };

/** Abonnement aux seuls événements de scène (bitmask officiel `EventSubscription.Scenes`). */
const SCENES_EVENT_SUBSCRIPTION = 1 << 2;

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
 *   onStatus?: (status: { connected: boolean, reason: string | null }) => void,
 *   createSocket?: (url: string) => WebSocket,
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

  function publish(connected, reason = null) {
    deps.onStatus?.({ connected, reason });
  }

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
      publish(true);
      log('connecté à OBS — écoute des changements de scène');
      requestSceneList();
      return;
    }

    if (message.op === OBS_OPCODE.REQUEST_RESPONSE && message.d?.requestId === 'scene-list') {
      const scenes = message.d?.responseData?.scenes;
      if (Array.isArray(scenes)) {
        deps.onScenes?.(scenes.map((scene) => scene?.sceneName).filter((name) => typeof name === 'string'));
      }
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
    stop() {
      stopped = true;
      socket?.close();
      socket = null;
    },
  };
}
