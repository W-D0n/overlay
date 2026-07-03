// @ts-check
/**
 * relay/server.js — Relais Bun (S4) : orchestration réseau (effets).
 *
 * Trois rôles :
 *   1. Client OBS WebSocket v5 — traduit `CurrentProgramSceneChanged` en `scene.set`.
 *   2. Serveur pour l'overlay — WS (diffusion) + HTTP `POST /emit` (injection externe authentifiée).
 *   3. Émetteur de requêtes OBS WS v5 (S6, tranche ciblée) — `POST /refresh-source` envoie
 *      `PressInputPropertiesButton` (rafraîchit le cache de la Browser Source overlay, même action
 *      que le bouton "Actualiser le cache" dans OBS), pour automatiser le rafraîchissement après
 *      une sauvegarde depuis `dev/dotgrid-tuner.html`.
 *
 * Logique pure extraite et testée séparément (AD-1) :
 *   - `obs-scene-map.js`  → correspondance nom-scène-OBS → SceneId
 *   - `obs-auth.js`       → calcul de l'auth SHA256 OBS WS v5
 *   - `rate-limiter.js`   → fenêtre glissante appliquée à `/emit`
 *
 * Lancement : `bun relay/server.js` (variables d'env requises, voir §Config ci-dessous).
 * Voir docs/specs/relay-bun-s4.md.
 */
import { mapObsSceneToOverlaySceneId } from './obs-scene-map.js';
import { computeObsAuthResponse } from './obs-auth.js';
import { createRateLimiter } from './rate-limiter.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const OBS_WS_URL = process.env.OBS_WS_URL ?? 'ws://localhost:4455';
const OBS_WS_PASSWORD = process.env.OBS_WS_PASSWORD ?? '';
const RELAY_PORT = Number(process.env.RELAY_PORT ?? 4456);
const RELAY_SECRET = process.env.OVERLAY_RELAY_SECRET;
/** Nom exact de la Browser Source overlay dans OBS (panneau Sources) — pour /refresh-source. */
const OBS_BROWSER_SOURCE_NAME = process.env.OBS_BROWSER_SOURCE_NAME ?? 'Overlay Atelier';

if (!RELAY_SECRET) {
  console.error('[relay] OVERLAY_RELAY_SECRET manquant — arrêt (jamais de relais sans auth, voir AC edge case).');
  process.exit(1);
}

const OBS_RECONNECT_DELAY_MS = 3000;

/** `/emit` : 20 requêtes / 10s / IP — généreux pour un usage légitime (scripts, bot), borne l'abus. */
const emitRateLimiter = createRateLimiter({ windowMs: 10000, maxRequests: 20 });

// ─── Diffusion vers les clients overlay ────────────────────────────────────────

/** @type {Set<import('bun').ServerWebSocket<unknown>>} */
const overlayClients = new Set();

/**
 * @param {{ type: string, data?: unknown }} message
 */
function broadcastToOverlay(message) {
  const payload = JSON.stringify(message);
  overlayClients.forEach((client) => client.send(payload));
}

// ─── Client OBS WebSocket v5 ────────────────────────────────────────────────

/** Opcodes du protocole obs-websocket v5. */
const OBS_OPCODE = { HELLO: 0, IDENTIFY: 1, IDENTIFIED: 2, REQUEST: 6, REQUEST_RESPONSE: 7, EVENT: 5 };

/** Délai avant abandon d'une requête OBS sans réponse (évite une promesse qui pend indéfiniment). */
const OBS_REQUEST_TIMEOUT_MS = 5000;

let obsConnected = false;
/** @type {WebSocket | null} */
let obsSocket = null;
/** @type {Map<string, { resolve: (v: any) => void, reject: (e: Error) => void, timeout: ReturnType<typeof setTimeout> }>} */
const pendingObsRequests = new Map();

/**
 * Envoyer une requête OBS WS v5 et attendre sa réponse (opcode 6 → 7, appariées par `requestId`).
 * @param {string} requestType
 * @param {Record<string, unknown>} [requestData]
 * @returns {Promise<unknown>} `responseData` de la réponse OBS
 */
function sendObsRequest(requestType, requestData) {
  return new Promise((resolve, reject) => {
    if (!obsSocket || !obsConnected) { reject(new Error('OBS non connecté')); return; }

    const requestId = crypto.randomUUID();
    const timeout = setTimeout(() => {
      pendingObsRequests.delete(requestId);
      reject(new Error(`Timeout requête OBS "${requestType}"`));
    }, OBS_REQUEST_TIMEOUT_MS);

    pendingObsRequests.set(requestId, { resolve, reject, timeout });
    obsSocket.send(JSON.stringify({ op: OBS_OPCODE.REQUEST, d: { requestType, requestId, requestData } }));
  });
}

/** Se connecter à OBS ; en cas d'échec, retry avec le même pattern que `store.js`. */
function connectToObs() {
  let ws;
  try {
    ws = new WebSocket(OBS_WS_URL);
  } catch {
    scheduleObsReconnect();
    return;
  }

  ws.addEventListener('message', async (event) => {
    let msg;
    try {
      msg = JSON.parse(String(event.data));
    } catch {
      return;
    }
    await handleObsMessage(ws, msg);
  });

  ws.addEventListener('open', () => {
    obsConnected = true;
    obsSocket = ws;
    console.info('[relay] connecté à OBS WebSocket');
  });

  ws.addEventListener('close', () => {
    if (obsConnected) console.info('[relay] connexion OBS fermée — reconnexion');
    obsConnected = false;
    obsSocket = null;
    // Requêtes en attente : jamais de réponse possible sur une connexion fermée, échouer proprement.
    pendingObsRequests.forEach(({ reject, timeout }) => { clearTimeout(timeout); reject(new Error('Connexion OBS fermée')); });
    pendingObsRequests.clear();
    scheduleObsReconnect();
  });

  ws.addEventListener('error', () => {
    // 'close' suit toujours 'error' — pas de traitement séparé nécessaire
  });
}

function scheduleObsReconnect() {
  setTimeout(connectToObs, OBS_RECONNECT_DELAY_MS);
}

/**
 * @param {WebSocket} ws
 * @param {any} msg
 */
async function handleObsMessage(ws, msg) {
  if (msg.op === OBS_OPCODE.HELLO) {
    const challengeInfo = msg.d?.authentication;
    /** @type {any} */
    const identify = { rpcVersion: msg.d.rpcVersion };
    if (challengeInfo) {
      identify.authentication = await computeObsAuthResponse({
        password: OBS_WS_PASSWORD,
        salt: challengeInfo.salt,
        challenge: challengeInfo.challenge,
      });
    }
    ws.send(JSON.stringify({ op: OBS_OPCODE.IDENTIFY, d: identify }));
    return;
  }

  if (msg.op === OBS_OPCODE.IDENTIFIED) {
    console.info('[relay] OBS identifié — écoute des changements de scène');
    return;
  }

  if (msg.op === OBS_OPCODE.REQUEST_RESPONSE) {
    const { requestId, requestStatus, responseData } = msg.d ?? {};
    const pending = pendingObsRequests.get(requestId);
    if (!pending) return; // réponse à une requête déjà expirée (timeout) — ignorée
    pendingObsRequests.delete(requestId);
    clearTimeout(pending.timeout);
    if (requestStatus?.result) pending.resolve(responseData);
    else pending.reject(new Error(requestStatus?.comment ?? 'Requête OBS refusée'));
    return;
  }

  if (msg.op === OBS_OPCODE.EVENT && msg.d?.eventType === 'CurrentProgramSceneChanged') {
    const obsSceneName = msg.d.eventData?.sceneName;
    const sceneId = mapObsSceneToOverlaySceneId(obsSceneName);
    if (!sceneId) {
      console.warn(`[relay] scène OBS "${obsSceneName}" absente de la table de correspondance — ignorée`);
      return;
    }
    broadcastToOverlay({ type: 'scene.set', data: { scene: sceneId } });
  }
}

// ─── Serveur overlay : WS + HTTP /emit ─────────────────────────────────────────

Bun.serve({
  port: RELAY_PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === '/ws') {
      const token = url.searchParams.get('token');
      if (token !== RELAY_SECRET) return new Response('unauthorized', { status: 401 });
      const upgraded = server.upgrade(req);
      return upgraded ? undefined : new Response('upgrade failed', { status: 500 });
    }

    if (url.pathname === '/emit' && req.method === 'POST') {
      const auth = req.headers.get('authorization');
      if (auth !== `Bearer ${RELAY_SECRET}`) return new Response('unauthorized', { status: 401 });

      const clientIp = server.requestIP(req)?.address ?? 'unknown';
      if (!emitRateLimiter.allow(clientIp, Date.now())) {
        return new Response('rate limited', { status: 429 });
      }

      return req.json()
        .then((body) => {
          if (typeof body?.type !== 'string') return new Response('invalid body', { status: 400 });
          broadcastToOverlay(body);
          return new Response('ok');
        })
        .catch(() => new Response('invalid json', { status: 400 }));
    }

    if (url.pathname === '/refresh-source' && req.method === 'POST') {
      const auth = req.headers.get('authorization');
      if (auth !== `Bearer ${RELAY_SECRET}`) return new Response('unauthorized', { status: 401 });

      return sendObsRequest('PressInputPropertiesButton', {
        inputName: OBS_BROWSER_SOURCE_NAME,
        propertyName: 'refreshnocache',
      })
        .then(() => new Response('ok'))
        .catch((err) => new Response(String(err), { status: 502 }));
    }

    if (url.pathname === '/') return new Response('relay ok');

    return new Response('not found', { status: 404 });
  },
  websocket: {
    open(ws) {
      overlayClients.add(ws);
      console.info(`[relay] client overlay connecté (${overlayClients.size} actif(s))`);
    },
    close(ws) {
      overlayClients.delete(ws);
    },
    message() {
      // L'overlay ne pousse rien au relais — connexion unidirectionnelle relais → overlay.
    },
  },
});

console.info(`[relay] écoute overlay sur ws://localhost:${RELAY_PORT}/ws — HTTP /emit sur le même port`);
connectToObs();
