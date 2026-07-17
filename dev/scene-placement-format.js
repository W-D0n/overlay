// @ts-check
/**
 * dev/scene-placement-format.js — Application d'un `placement` dans une `SceneConfig` JSON
 * (logique pure).
 *
 * Depuis la migration des scènes vers JSON (S8, `scenes/data/*.scene.json`), remplace la
 * réécriture par regex sur source JS (S7) par un parse/mutate/stringify direct — la donnée est
 * déjà un objet, plus besoin de la traiter comme du texte à motif.
 * N'écrit QUE la valeur `placement` d'une couche déjà migrée (même portée qu'en S7 : déplacer,
 * pas migrer) — la couche doit déjà avoir un `placement` existant. Aucun effet de bord (pas de
 * lecture/écriture disque ici — géré par `scene-data-server.js`).
 */

/**
 * Retourne une nouvelle `SceneConfig` avec le `placement` de la couche `layerName` remplacé.
 * Ne mute pas l'entrée.
 *
 * @param {import('../types.js').SceneConfig} sceneConfig
 * @param {string} layerName
 * @param {import('../types.js').Placement} placement
 * @returns {import('../types.js').SceneConfig}
 * @throws {Error} Si la couche ou son `placement` existant sont introuvables
 */
export function applyPlacementToLayer(sceneConfig, layerName, placement) {
  const layer = sceneConfig.layers.find((l) => l.name === layerName);
  if (!layer || !layer.placement) {
    throw new Error(`placement introuvable pour la couche "${layerName}" — pas encore migrée, ou nom incorrect.`);
  }

  return {
    ...sceneConfig,
    layers: sceneConfig.layers.map((l) => (l.name === layerName ? { ...l, placement } : l)),
  };
}
