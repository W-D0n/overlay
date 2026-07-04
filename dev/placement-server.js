// @ts-check
/**
 * dev/placement-server.js — Serveur d'écriture pour placement-panel.html (S7, dev-only).
 *
 * NE JAMAIS lancer pendant le live — écrit sur disque dans `scenes/data/*.scene.json` (migration
 * S8 : toutes les scènes, historiques comme créées par l'éditeur, vivent au même endroit), séparé
 * du relais de production (`relay/server.js`). Même pattern que `dev/scene-data-server.js` (S8).
 *
 * Routes :
 *   POST /save-placement — `{ sceneId, layerName, placement }`, réécrit uniquement la valeur
 *                           `placement` de la couche ciblée (déjà migrée, pas d'insertion).
 *   WS   /reload-ws       — diffuse `reload` à chaque sauvegarde réussie (voir dev/tuner-server.js
 *                            pour le même mécanisme côté DotGrid ; `index.html?livereload=1` s'y
 *                            connecte automatiquement).
 * Logique de remplacement testée séparément (AD-1) : voir `scene-placement-format.js`.
 *
 * Lancement : `bun dev/placement-server.js`
 */
import { applyPlacementToLayer } from './scene-placement-format.js';

const PORT = Number(process.env.PLACEMENT_PORT ?? 4459);
const DATA_DIR = `${import.meta.dir}/../scenes/data`;

/** Évite l'accès à un fichier arbitraire via un `sceneId` malicieux (path traversal). */
const VALID_SCENE_ID = /^[a-z][a-z0-9-]*$/;

/** CORS permissif — outil de dev local uniquement, jamais exposé. */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/** @type {Set<import('bun').ServerWebSocket<unknown>>} */
const reloadClients = new Set();

function broadcastReload() {
  reloadClients.forEach((client) => client.send('reload'));
}

Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/reload-ws') {
      const upgraded = server.upgrade(req);
      return upgraded ? undefined : new Response('upgrade failed', { status: 500 });
    }

    if (url.pathname === '/save-placement' && req.method === 'POST') {
      try {
        const body = await req.json();
        const { sceneId, layerName, placement } = body;

        if (typeof sceneId !== 'string' || !VALID_SCENE_ID.test(sceneId)) {
          return new Response('sceneId invalide', { status: 400, headers: CORS_HEADERS });
        }
        if (typeof layerName !== 'string' || !layerName) {
          return new Response('layerName invalide', { status: 400, headers: CORS_HEADERS });
        }

        const targetFile = `${DATA_DIR}/${sceneId}.scene.json`;
        const current = await Bun.file(targetFile).json();
        const updated = applyPlacementToLayer(current, layerName, placement);
        await Bun.write(targetFile, `${JSON.stringify(updated, null, 2)}\n`);

        console.info(`[placement-server] scenes/data/${sceneId}.scene.json — couche "${layerName}" mise à jour`);
        broadcastReload();
        return new Response('ok', { headers: CORS_HEADERS });
      } catch (err) {
        console.error('[placement-server] échec de la sauvegarde :', err);
        return new Response(String(err), { status: 500, headers: CORS_HEADERS });
      }
    }

    return new Response('not found', { status: 404, headers: CORS_HEADERS });
  },
  websocket: {
    open(ws) { reloadClients.add(ws); },
    close(ws) { reloadClients.delete(ws); },
    message() {},
  },
});

console.info(`[placement-server] écoute sur http://localhost:${PORT} — écrit dans scenes/data/*.scene.json`);
console.info('[placement-server] outil de DEV uniquement — ne pas lancer pendant le live');
