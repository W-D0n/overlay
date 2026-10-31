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
import { createAssetStore } from './asset-store.js';
import { createVersionStore } from './version-store.js';
import { createChannels } from './channels.js';
import { createHost } from './host.js';
import { LOOPBACK_HOST } from './local-access-policy.js';
import { createConnectionStore } from './connection-store.js';
import { createConnectionRoutes } from './connection-routes.js';
import { createObsConnection } from './obs-connection.js';
import { resolveObs } from './connection-settings.js';
import { SUPERVISED_ENV } from './supervisor.js';
import { BACKGROUND_STATE_PORT, STATIC_PORT } from '../ports.config.js';

const PORT = Number(process.env.BACKGROUND_STATE_PORT ?? BACKGROUND_STATE_PORT);
const STATE_FILE = process.env.BACKGROUND_STATE_FILE ?? `${import.meta.dir}/data/background-state.json`;
/** Les images importées vivent à côté du fichier d'état : un état de test (`BACKGROUND_STATE_FILE`) a ses propres images. */
const ASSETS_DIR = process.env.BACKGROUND_ASSETS_DIR ?? `${STATE_FILE}.assets`;

/** Les réglages saisis dans le Studio (mot de passe OBS…) : un fichier à part, jamais exporté ni renvoyé par l'API. */
const connectionStore = createConnectionStore({ path: `${STATE_FILE}.connections.json` });

/** @type {ReturnType<typeof createHost>} */
let host;

const obsConnection = createObsConnection({
  resolve: async () => resolveObs({ file: await connectionStore.read(), env: process.env }),
  onSceneChange: (sceneName) => { void host.applySceneMapping(sceneName); },
});

host = createHost({
  store: createStateStore({ path: STATE_FILE }),
  assets: createAssetStore({ dir: ASSETS_DIR }),
  versions: createVersionStore({ path: `${STATE_FILE}.versions.json` }),
  channels: createChannels(),
  obs: obsConnection,
  connections: createConnectionRoutes({ store: connectionStore, obs: obsConnection, env: process.env }),
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

// Le client OBS ne s'ouvre qu'avec un mot de passe (saisi dans le Studio, sinon `OBS_WS_PASSWORD`) : sans lui, ce serveur se comporte
// exactement comme avant ③ (docs/specs/obs-scene-preset-mapping.md). Le Studio le reconfigure sans relancer le serveur.
void obsConnection.restart();
