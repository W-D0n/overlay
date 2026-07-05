// @ts-check
/**
 * dev/scene-data-format.js — Manipulation pure du manifeste + historique de scènes dynamiques
 * (S8 session 4/6, historique 2026-07-05).
 *
 * Aucun effet de bord (pas de lecture/écriture disque ici — géré par `scene-data-server.js`).
 * Voir docs/specs/scene-definition-v2.md §Session 4/6 et docs/specs/scene-history-protocol.md.
 */

/** Nombre d'entrées récentes conservées au-delà de l'origine (jamais purgée). */
const HISTORY_WINDOW_SIZE = 100;

/**
 * Ajouter un id au manifeste, sans doublon.
 * @param {string[]} manifest
 * @param {string} id
 * @returns {string[]}
 */
export function addSceneToManifest(manifest, id) {
  if (manifest.includes(id)) return manifest;
  return [...manifest, id];
}

/**
 * Retirer un id du manifeste. Un id absent est un no-op (jamais de throw, AC-25).
 * @param {string[]} manifest
 * @param {string} id
 * @returns {string[]}
 */
export function removeSceneFromManifest(manifest, id) {
  return manifest.filter((existing) => existing !== id);
}

/**
 * Ajoute une entrée à l'historique d'une scène. `history[0]` (l'origine — la toute première
 * sauvegarde jamais enregistrée) n'est jamais purgé ; au-delà, fenêtre glissante des
 * `HISTORY_WINDOW_SIZE` entrées les plus récentes (AC-01, AC-02, scene-history-protocol.md).
 *
 * @param {{ timestamp: number, sceneConfig: import('../types.js').SceneConfig }[]} history
 * @param {{ timestamp: number, sceneConfig: import('../types.js').SceneConfig }} entry
 * @returns {{ timestamp: number, sceneConfig: import('../types.js').SceneConfig }[]}
 */
export function pushHistoryEntry(history, entry) {
  if (history.length === 0) return [entry];

  const [origin, ...rest] = history;
  const updated = [...rest, entry];
  const trimmed = updated.length > HISTORY_WINDOW_SIZE ? updated.slice(updated.length - HISTORY_WINDOW_SIZE) : updated;
  return [origin, ...trimmed];
}
