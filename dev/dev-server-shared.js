// @ts-check
/**
 * dev/dev-server-shared.js — CORS et réponse d'erreur JSON, partagés par les serveurs de dev HTTP.
 *
 * Partagés par les serveurs de dev qui répondent en JSON (aujourd'hui le serveur d'état du fond).
 */

/** CORS pour pages locales : l'accès est filtré en amont par `rejectNonLocalRequest` (dev/local-access-policy.js). */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Overlay-Control',
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
