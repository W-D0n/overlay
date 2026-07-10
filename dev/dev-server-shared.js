// @ts-check
/**
 * dev/dev-server-shared.js — CORS et réponse d'erreur JSON, partagés par les serveurs de dev HTTP.
 *
 * `CORS_HEADERS` et la réponse d'erreur étaient dupliqués à l'identique dans scene-data-server.js,
 * placement-server.js, tuner-server.js et obs-scene-map-server.js (review architecture, 2026-07-10)
 * — trois d'entre eux renvoyaient en plus du texte brut au lieu de JSON sur erreur, forme
 * incohérente avec scene-data-server.js. Extrait ici, une seule fois.
 */

/** CORS permissif — outil de dev local uniquement, jamais exposé. */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * @param {string} message
 * @param {number} status
 * @returns {Response}
 */
export function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
