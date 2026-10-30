// @ts-check
/**
 * dev/background-state-server.js — Serveur d'état du fond standalone (2026-07-14).
 *
 * Persiste l'état `{ current, presets, … }` de `background.html` (URL OBS background-only) dans
 * `dev/data/background-state.json` et diffuse chaque changement d'état courant en WebSocket.
 * Contrairement aux autres serveurs de dev, celui-ci tourne AUSSI pendant le live (lancé par
 * start-stream.js) : il n'écrit qu'un fichier d'état JSON, jamais de code source.
 * Voir docs/specs/background-standalone.md.
 *
 * Ce script ne fait que composer : environnement, écoute, client OBS. Les routes sont dans `dev/host.js` (et
 * `dev/preset-routes.js`), le fichier d'état dans `dev/state-store.js`, les canaux temps réel dans `dev/channels.js`.
 *
 * Lancement : `bun dev/background-state-server.js`
 */
import { createStateStore } from './state-store.js';
import { createChannels } from './channels.js';
import { createHost } from './host.js';
import { LOOPBACK_HOST } from './local-access-policy.js';
import { createObsSceneClient } from './obs-scene-client.js';
import { inspectObs } from './obs-inspector.js';
import { SUPERVISED_ENV } from './supervisor.js';
import { BACKGROUND_STATE_PORT, STATIC_PORT } from '../ports.config.js';

const PORT = Number(process.env.BACKGROUND_STATE_PORT ?? BACKGROUND_STATE_PORT);
const OBS_WS_URL = process.env.OBS_WS_URL ?? 'ws://127.0.0.1:4455';
const OBS_WS_PASSWORD = process.env.OBS_WS_PASSWORD ?? '';
const STATE_FILE = process.env.BACKGROUND_STATE_FILE ?? `${import.meta.dir}/data/background-state.json`;

/** @type {import('./host.js').ObsStatus} */
const obsStatus = { connected: false, reason: null, scenes: [], activeScene: null };

/** @type {ReturnType<typeof createObsSceneClient> | null} */
let obsClient = null;

const host = createHost({
  store: createStateStore({ path: STATE_FILE }),
  channels: createChannels(),
  obs: {
    status: () => obsStatus,
    configured: OBS_WS_PASSWORD !== '',
    inspect: OBS_WS_PASSWORD === '' ? null : () => inspectObs(/** @type {NonNullable<typeof obsClient>} */ (obsClient).request),
  },
  control: {
    supervised: process.env[SUPERVISED_ENV] === '1',
    exit: (code) => process.exit(code),
  },
  staticPort: Number(process.env.STATIC_PORT ?? STATIC_PORT),
});

Bun.serve({
  hostname: LOOPBACK_HOST,
  port: PORT,
  fetch: host.fetch,
  websocket: host.websocket,
});

console.info(`[background-state-server] écoute sur http://localhost:${PORT} — état dans ${STATE_FILE}`);

// Le client OBS démarre uniquement si un mot de passe est configuré : sans lui, ce serveur se comporte
// exactement comme avant ③ (docs/specs/obs-scene-preset-mapping.md).
if (OBS_WS_PASSWORD !== '') {
  obsClient = createObsSceneClient({
    url: OBS_WS_URL,
    password: OBS_WS_PASSWORD,
    onSceneChange: (sceneName) => { obsStatus.activeScene = sceneName; host.applySceneMapping(sceneName); },
    onScenes: (scenes) => { obsStatus.scenes = scenes; },
    onActiveScene: (sceneName) => { obsStatus.activeScene = sceneName; },
    onStatus: ({ connected, reason }) => {
      obsStatus.connected = connected;
      obsStatus.reason = reason;
      if (!connected) obsStatus.activeScene = null;
    },
  });
} else {
  obsStatus.reason = 'not-configured';
  console.info('[background-state-server] OBS_WS_PASSWORD absent — mapping scène → preset désactivé');
}
