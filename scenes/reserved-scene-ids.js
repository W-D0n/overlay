// @ts-check
/**
 * scenes/reserved-scene-ids.js — Ids de scène jamais fusionnables/écrasables par une scène
 * dynamique (S8, défense en profondeur — vide aujourd'hui, aucune scène n'est protégée contre
 * suppression/écrasement, décision owner 2026-07-04, voir docs/inbox.md).
 *
 * Module séparé de `scenes/registry.js` à dessein (fix production, 2026-07-05) : `registry.js`
 * importe les 9 `*.wire.js` (pour `SCENE_WIRES`), qui importent tous `store.js`, dont le chargement
 * du module ouvre une vraie connexion WebSocket au relais (`connectWebSocket()`, sans garde
 * navigateur). `dev/scene-data-server.js` (un serveur Bun sans navigateur) important
 * `STATIC_SCENE_IDS` depuis `registry.js` se retrouvait donc, par effet de bord transitif, connecté
 * au relais comme un faux client overlay — il recevait les vrais messages `scene.set` diffusés à
 * chaque changement de scène OBS et plantait sur `document.dispatchEvent` (pas de DOM sous Bun),
 * loggant "Message WS malformé" en boucle. Ce module n'importe rien d'autre : sûr à importer depuis
 * n'importe quel contexte (navigateur ou Bun).
 *
 * @type {string[]}
 */
export const STATIC_SCENE_IDS = [];
