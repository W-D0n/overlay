// @ts-check
/**
 * dev/obs-scene-map-server.js — Serveur d'écriture pour la section "Renommer les scènes OBS" du
 * panneau de dev (dev-only).
 *
 * NE JAMAIS lancer pendant le live — écrit sur disque (`relay/obs-scene-map-data.js`), séparé du
 * relais de production (`relay/server.js`, qui LIT ce fichier au démarrage mais ne l'écrit jamais).
 *
 * Routes :
 *   POST /save-obs-scene-map — reçoit `{ obsName, sceneId }[]`, reconstruit et réécrit le fichier
 *     de données en entier. Sérialisé via `withSaveLock` (même précédent que
 *     `tuner-server.js`/`scene-data-server.js`).
 *
 * Lancement : `bun dev/obs-scene-map-server.js`
 */
import { buildSceneMap, formatObsSceneMapDataFile } from './obs-scene-map-format.js';
import { createKeyedLock } from './keyed-lock.js';
import { CORS_HEADERS, jsonError } from './dev-server-shared.js';

const PORT = Number(process.env.OBS_SCENE_MAP_PORT ?? 4461);
const TARGET_FILE = `${import.meta.dir}/../relay/obs-scene-map-data.js`;
const withSaveLock = createKeyedLock();
const SAVE_LOCK_KEY = 'obs-scene-map';

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/save-obs-scene-map' && req.method === 'POST') {
      try {
        const entries = /** @type {{ obsName: string, sceneId: string }[]} */ (await req.json());
        const map = buildSceneMap(entries);
        await withSaveLock(SAVE_LOCK_KEY, async () => {
          await Bun.write(TARGET_FILE, formatObsSceneMapDataFile(map));
        });
        console.info('[obs-scene-map-server] relay/obs-scene-map-data.js mis à jour');
        return new Response('ok', { headers: CORS_HEADERS });
      } catch (err) {
        console.error('[obs-scene-map-server] échec de la sauvegarde :', err);
        return jsonError(String(err), 500);
      }
    }

    return jsonError('not found', 404);
  },
});

console.info(`[obs-scene-map-server] écoute sur http://localhost:${PORT} — écrit dans relay/obs-scene-map-data.js`);
console.info('[obs-scene-map-server] outil de DEV uniquement — ne pas lancer pendant le live');
console.info('[obs-scene-map-server] relancer relay/server.js après une sauvegarde pour recharger le mapping (import statique)');
