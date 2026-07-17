// @ts-check
/**
 * dev/dev-server-shared.js — CORS et réponse d'erreur JSON, partagés par les serveurs de dev HTTP.
 *
 * `CORS_HEADERS` et la réponse d'erreur étaient dupliqués entre les serveurs d'édition. Extraits
 * ici pour scene-data-server.js, tuner-server.js, obs-scene-map-server.js et le serveur d'état du
 * fond. L'ancien proxy placement-server.js a été supprimé : scene-data-server possède sa route.
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
