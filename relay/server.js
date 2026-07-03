// @ts-check
/**
 * relay/server.js — Relais Bun (S4) : orchestration réseau (effets).
 *
 * Deux rôles :
 *   1. Client OBS WebSocket v5 — traduit `CurrentProgramSceneChanged` en `scene.set`.
 *   2. Serveur pour l'overlay — WS (diffusion) + HTTP `POST /emit` (injection externe authentifiée).
 *
 * Logique pure extraite et testée séparément (AD-1) :
 *   - `obs-scene-map.js`  → correspondance nom-scène-OBS → SceneId
 *   - `obs-auth.js`       → calcul de l'auth SHA256 OBS WS v5
 *
 * Lancement : `bun relay/server.js` (variables d'env requises, voir §Config ci-dessous).
 * Voir docs/specs/relay-bun-s4.md.
 */
import { mapObsSceneToOverlaySceneId } from './obs-scene-map.js';
import { computeObsAuthResponse } from './obs-auth.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const OBS_WS_URL = process.env.OBS_WS_URL ?? 'ws://localhost:4455';
const OBS_WS_PASSWORD = process.env.OBS_WS_PASSWORD ?? '';
const RELAY_PORT = Number(process.env.RELAY_PORT ?? 4456);
const RELAY_SECRET = process.env.OVERLAY_RELAY_SECRET;

if (!RELAY_SECRET) {
  console.error('[relay] OVERLAY_RELAY_SECRET manquant — arrêt (jamais de relais sans auth, voir AC edge case).');
  process.exit(1);
}

const OBS_RECONNECT_DELAY_MS = 3000;

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
const OBS_OPCODE = { HELLO: 0, IDENTIFY: 1, IDENTIFIED: 2, EVENT: 5 };

let obsConnected = false;

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
    console.info('[relay] connecté à OBS WebSocket');
  });

  ws.addEventListener('close', () => {
    if (obsConnected) console.info('[relay] connexion OBS fermée — reconnexion');
    obsConnected = false;
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
      return req.json()
        .then((body) => {
          if (typeof body?.type !== 'string') return new Response('invalid body', { status: 400 });
          broadcastToOverlay(body);
          return new Response('ok');
        })
        .catch(() => new Response('invalid json', { status: 400 }));
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
