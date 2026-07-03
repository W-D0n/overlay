// @ts-check
/**
 * dev/tuner-server.js — Serveur d'écriture pour dotgrid-tuner.html (S5, dev-only).
 *
 * NE JAMAIS lancer pendant le live — c'est un outil de dev qui écrit sur disque
 * (`components/DotGridAnimated.js`), séparé du relais de production (`relay/server.js`).
 *
 * Route unique : `POST /save` — reçoit les paramètres courants du tuner, réécrit le fichier source.
 * Logique de remplacement testée séparément (AD-1) : voir `dotgrid-params-format.js`.
 *
 * Lancement : `bun dev/tuner-server.js`
 */
import { applyDotGridParamsToSource } from './dotgrid-params-format.js';

const PORT = Number(process.env.TUNER_PORT ?? 4458);
const TARGET_FILE = `${import.meta.dir}/../components/DotGridAnimated.js`;

/** CORS permissif — outil de dev local uniquement, jamais exposé. */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/save' && req.method === 'POST') {
      try {
        const body = await req.json();
        const current = await Bun.file(TARGET_FILE).text();
        const updated = applyDotGridParamsToSource(current, body);
        await Bun.write(TARGET_FILE, updated);
        console.info('[tuner-server] components/DotGridAnimated.js mis à jour');
        return new Response('ok', { headers: CORS_HEADERS });
      } catch (err) {
        console.error('[tuner-server] échec de la sauvegarde :', err);
        return new Response(String(err), { status: 500, headers: CORS_HEADERS });
      }
    }

    return new Response('not found', { status: 404, headers: CORS_HEADERS });
  },
});

console.info(`[tuner-server] écoute sur http://localhost:${PORT} — écrit dans components/DotGridAnimated.js`);
console.info('[tuner-server] outil de DEV uniquement — ne pas lancer pendant le live');
