// @ts-check
/**
 * dev/e2e/fake-obs.js — Un faux serveur OBS WebSocket v5 pour les essais de bout en bout : il fait l'échange d'authentification
 * **pour de vrai** (défi, sel, empreinte SHA-256 vérifiée avec le mot de passe attendu), refuse un mauvais mot de passe par la
 * fermeture 4009 d'OBS, répond à `GetSceneList` et sait annoncer un changement de scène. Port attribué par le système : jamais le
 * 4455 de l'owner.
 */
import { computeObsAuthResponse } from '../../obs-auth.js';

const OP = { HELLO: 0, IDENTIFY: 1, IDENTIFIED: 2, EVENT: 5, REQUEST: 6, REQUEST_RESPONSE: 7 };
const SALT = 'sel-de-l-essai';
const CHALLENGE = 'defi-de-l-essai';

/**
 * @param {{ password: string, scenes?: string[] }} options
 */
export function startFakeObs({ password, scenes = ['Jeu', 'Pause'] }) {
  /** @type {Set<any>} */
  const identified = new Set();
  let identifiedCount = 0;
  let rejectedCount = 0;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(req, srv) {
      return srv.upgrade(req) ? undefined : new Response('websocket attendu', { status: 426 });
    },
    websocket: {
      open(ws) {
        ws.send(JSON.stringify({ op: OP.HELLO, d: { obsWebSocketVersion: '5.5.0', rpcVersion: 1, authentication: { challenge: CHALLENGE, salt: SALT } } }));
      },
      async message(ws, raw) {
        const message = JSON.parse(String(raw));
        if (message.op === OP.IDENTIFY) {
          const expected = await computeObsAuthResponse({ password, salt: SALT, challenge: CHALLENGE });
          if (message.d?.authentication !== expected) {
            rejectedCount += 1;
            ws.close(4009, 'Authentication failed.');
            return;
          }
          identified.add(ws);
          identifiedCount += 1;
          ws.send(JSON.stringify({ op: OP.IDENTIFIED, d: { negotiatedRpcVersion: 1 } }));
          return;
        }
        if (message.op === OP.REQUEST && identified.has(ws)) {
          const { requestType, requestId } = message.d;
          const responseData = requestType === 'GetSceneList'
            ? { scenes: scenes.map((sceneName) => ({ sceneName })), currentProgramSceneName: scenes[0] }
            : {};
          ws.send(JSON.stringify({ op: OP.REQUEST_RESPONSE, d: { requestType, requestId, requestStatus: { result: true, code: 100 }, responseData } }));
        }
      },
      close(ws) {
        identified.delete(ws);
      },
    },
  });

  return {
    url: `ws://127.0.0.1:${server.port}`,
    /** Connexions authentifiées en ce moment. */
    get connected() { return identified.size; },
    /** Authentifications réussies depuis le départ. */
    get identifiedCount() { return identifiedCount; },
    /** Authentifications refusées depuis le départ. */
    get rejectedCount() { return rejectedCount; },
    /** @param {string} sceneName */
    changeScene(sceneName) {
      for (const ws of identified) ws.send(JSON.stringify({ op: OP.EVENT, d: { eventType: 'CurrentProgramSceneChanged', eventIntent: 4, eventData: { sceneName } } }));
    },
    stop() {
      server.stop(true);
    },
  };
}
