// @ts-check
/**
 * dev/placement-server.js — Proxy HTTP pour placement-panel.html (S7, dev-only).
 *
 * NE JAMAIS lancer pendant le live — relaie vers `scene-data-server.js`, séparé du relais de
 * production (`relay/server.js`).
 *
 * Ce process n'écrit plus AUCUN fichier lui-même depuis le 2026-07-06 (voir
 * docs/specs/scene-history-protocol.md §Concurrence d'accès). Avant, il lisait/modifiait/écrivait
 * `scenes/data/<id>.scene.json` directement, sans aucune sérialisation : un test de charge (10
 * requêtes `/save-placement` concurrentes) a corrompu une lecture en plein milieu d'une écriture
 * d'un autre appel (`SyntaxError: Unexpected end of JSON input`), avec un risque de perte
 * silencieuse de placement en cas de course moins visible. `scene-data-server.js` est l'unique
 * écrivain de ce fichier (et de son historique) — ce process relaie simplement la requête.
 *
 * Routes :
 *   POST /save-placement — `{ sceneId, layerName, placement }`, relayé tel quel vers
 *                           `POST http://localhost:<SCENE_DATA_PORT>/save-placement`.
 *   WS   /reload-ws       — diffuse `reload` à chaque sauvegarde réussie (voir dev/tuner-server.js
 *                            pour le même mécanisme côté DotGrid ; `index.html?livereload=1` s'y
 *                            connecte automatiquement).
 *
 * Lancement : `bun dev/placement-server.js` (nécessite `bun dev/scene-data-server.js` démarré).
 */
const PORT = Number(process.env.PLACEMENT_PORT ?? 4459);
const SCENE_DATA_PORT = Number(process.env.SCENE_DATA_PORT ?? 4460);

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
      const body = await req.text();
      try {
        const res = await fetch(`http://localhost:${SCENE_DATA_PORT}/save-placement`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        const text = await res.text();
        if (res.ok) broadcastReload();
        else console.error(`[placement-server] scene-data-server a refusé la sauvegarde (${res.status}) : ${text}`);
        return new Response(text, {
          status: res.status,
          headers: { ...CORS_HEADERS, 'Content-Type': res.headers.get('Content-Type') ?? 'text/plain' },
        });
      } catch (err) {
        console.error('[placement-server] scene-data-server injoignable :', err);
        return new Response('scene-data-server injoignable — lancer "bun dev/scene-data-server.js"', {
          status: 502,
          headers: CORS_HEADERS,
        });
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

console.info(`[placement-server] écoute sur http://localhost:${PORT} — relaie vers scene-data-server.js (port ${SCENE_DATA_PORT})`);
console.info('[placement-server] outil de DEV uniquement — ne pas lancer pendant le live');
