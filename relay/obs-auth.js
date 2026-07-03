// @ts-check
/**
 * relay/obs-auth.js — Calcul de l'authentification OBS WebSocket v5 (logique pure).
 *
 * Protocole officiel (obs-websocket v5) :
 *   base64Secret  = base64(sha256(password + salt))
 *   authResponse  = base64(sha256(base64Secret + challenge))
 *
 * Utilise l'API Web Crypto (`crypto.subtle`), disponible nativement dans Bun — aucune dépendance.
 * Fonction async car `crypto.subtle.digest` est asynchrone, mais reste "pure" au sens métier :
 * aucun effet de bord, aucune donnée mutable partagée, résultat déterministe pour une entrée donnée.
 */

/**
 * @param {string} text
 * @returns {Promise<string>} digest SHA-256 encodé en base64
 */
async function sha256Base64(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

/**
 * Calculer la réponse d'authentification attendue par OBS WebSocket v5.
 *
 * @param {{ password: string, salt: string, challenge: string }} params
 * @returns {Promise<string>} valeur à placer dans `Identify.authentication`
 */
export async function computeObsAuthResponse({ password, salt, challenge }) {
  const base64Secret = await sha256Base64(password + salt);
  return sha256Base64(base64Secret + challenge);
}
