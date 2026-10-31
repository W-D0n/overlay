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
import { createEventIntake } from './event-intake.js';
import { createTwitchatLink } from './twitchat-link.js';
import { createTwitchAuth } from './twitch-auth.js';
import { createTwitchConnection } from './twitch-connection.js';
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

const channels = createChannels();
/** Toutes les sources d'alertes (bouton de test, Twitchat, EventSub) arrivent par ce point d'entrée. */
const intake = createEventIntake({ channels });
const twitchat = createTwitchatLink({ intake, getToken: () => connectionStore.twitchatToken() });
/**
 * Twitch (autorisation par code d'appareil, EventSub par WebSocket). Les trois adresses de Twitch se redirigent par l'environnement
 * (`TWITCH_ID_URL`, `TWITCH_API_URL`, `TWITCH_EVENTSUB_URL`) : c'est ce qui permet aux essais de parler à un faux Twitch.
 */
const twitch = createTwitchConnection({
  store: connectionStore,
  intake,
  auth: createTwitchAuth(process.env.TWITCH_ID_URL ? { idUrl: process.env.TWITCH_ID_URL } : {}),
  sessionOptions: {
    ...(process.env.TWITCH_EVENTSUB_URL ? { url: process.env.TWITCH_EVENTSUB_URL } : {}),
    ...(process.env.TWITCH_API_URL ? { apiUrl: process.env.TWITCH_API_URL } : {}),
  },
});

host = createHost({
  store: createStateStore({ path: STATE_FILE }),
  assets: createAssetStore({ dir: ASSETS_DIR }),
  versions: createVersionStore({ path: `${STATE_FILE}.versions.json` }),
  channels,
  obs: obsConnection,
  intake,
  twitchat,
  connections: createConnectionRoutes({ store: connectionStore, obs: obsConnection, env: process.env, twitchat, twitch, intake, statePort: PORT }),
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
void twitch.init();
