// @ts-check
/**
 * dev/scene-data-format.js — Manipulation pure du manifeste de scènes dynamiques (S8 session 4/6).
 *
 * Aucun effet de bord (pas de lecture/écriture disque ici — géré par `scene-data-server.js`).
 * Voir docs/specs/scene-definition-v2.md §Session 4/6.
 */

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
