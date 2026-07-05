// @ts-check
/**
 * dev/tuner-server.js — Serveur d'écriture pour dotgrid-tuner.html (S5, dev-only).
 *
 * NE JAMAIS lancer pendant le live — c'est un outil de dev qui écrit sur disque
 * (`components/DotGridAnimated.js`), séparé du relais de production (`relay/server.js`).
 *
 * Routes :
 *   POST /save     — reçoit les paramètres courants du tuner, réécrit le fichier source. Sérialisé
 *                      via `withSaveLock` (dev/keyed-lock.js, 2026-07-06, voir
 *                      docs/specs/scene-history-protocol.md §Concurrence d'accès) — sans ça, deux
 *                      sauvegardes rapprochées (double-clic, curseur glissé vite) peuvent
 *                      interléaver leur lecture-modification-écriture du même fichier source.
 *   WS   /reload-ws — diffuse un message `reload` à chaque sauvegarde réussie ; un onglet de
 *                      preview (ex. index.html) connecté peut s'auto-rafraîchir dessus (voir
 *                      docs/obs-setup.md pour le snippet console à coller dans l'onglet de test).
 * Logique de remplacement testée séparément (AD-1) : voir `dotgrid-params-format.js`.
 *
 * Lancement : `bun dev/tuner-server.js`
 */
import { applyDotGridParamsToSource } from './dotgrid-params-format.js';
import { createKeyedLock } from './keyed-lock.js';

const PORT = Number(process.env.TUNER_PORT ?? 4458);
const TARGET_FILE = `${import.meta.dir}/../components/DotGridAnimated.js`;
const withSaveLock = createKeyedLock();
const SAVE_LOCK_KEY = 'dotgrid-source';

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

    if (url.pathname === '/save' && req.method === 'POST') {
      try {
        const body = await req.json();
        await withSaveLock(SAVE_LOCK_KEY, async () => {
          const current = await Bun.file(TARGET_FILE).text();
          const updated = applyDotGridParamsToSource(current, body);
          await Bun.write(TARGET_FILE, updated);
        });
        console.info('[tuner-server] components/DotGridAnimated.js mis à jour');
        broadcastReload();
        return new Response('ok', { headers: CORS_HEADERS });
      } catch (err) {
        console.error('[tuner-server] échec de la sauvegarde :', err);
        return new Response(String(err), { status: 500, headers: CORS_HEADERS });
      }
    }

    return new Response('not found', { status: 404, headers: CORS_HEADERS });
  },
  websocket: {
    open(ws) { reloadClients.add(ws); },
    close(ws) { reloadClients.delete(ws); },
    message() {}, // aucune donnée attendue des clients — diffusion serveur → clients uniquement
  },
});

console.info(`[tuner-server] écoute sur http://localhost:${PORT} — écrit dans components/DotGridAnimated.js`);
console.info(`[tuner-server] WS /reload-ws — colle dans la console de l'onglet de test :`);
console.info(`  new WebSocket('ws://localhost:${PORT}/reload-ws').onmessage = () => location.reload();`);
console.info('[tuner-server] outil de DEV uniquement — ne pas lancer pendant le live');
