// @ts-check
/**
 * dev/obs-scene-map-format.js — Logique pure de régénération de `relay/obs-scene-map-data.js`.
 *
 * Le fichier cible reste un objet littéral JS (pas de JSON natif — voir `relay/obs-scene-map.js`,
 * incompatible navigateur sans attribut d'import). `formatObsSceneMapDataFile` régénère le fichier
 * ENTIER à partir d'un template (`JSON.stringify` produit une syntaxe objet valide identique en
 * JS/JSON pour ce cas `Record<string,string>`) — jamais une édition regex d'un fichier existant,
 * même précédent que `dev/scene-placement-format.js` (S8, docs/inbox.md §Décision tranchée). La
 * donnée est isolée dans son propre fichier (`obs-scene-map-data.js`), séparée de la logique
 * (`obs-scene-map.js`, jamais régénérée) — réécrire la donnée ne risque jamais de dupliquer/écraser
 * du code.
 */

/**
 * Reconstruit la table complète à partir d'une liste `{ obsName, sceneId }` (un par `SceneId`
 * overlay, un seul nom OBS par scène — pas de mapping many-to-one dans l'UI ; rien n'empêche
 * d'éditer `relay/obs-scene-map-data.js` à la main pour un cas many-to-one).
 * @param {{ obsName: string, sceneId: string }[]} entries
 * @returns {Record<string, string>}
 */
export function buildSceneMap(entries) {
  /** @type {Record<string, string>} */
  const map = {};
  for (const { obsName, sceneId } of entries) {
    const trimmed = obsName.trim();
    if (trimmed === '' || sceneId.trim() === '') continue; // entrée vide ignorée, pas une erreur
    map[trimmed] = sceneId;
  }
  return map;
}

/**
 * Régénère le contenu complet de `relay/obs-scene-map-data.js` à partir de la table. Pure — ne
 * touche pas au disque, l'appelant (`obs-scene-map-server.js`) écrit le résultat.
 * @param {Record<string, string>} map
 * @returns {string}
 */
export function formatObsSceneMapDataFile(map) {
  return `// @ts-check
/**
 * relay/obs-scene-map-data.js — Table de correspondance nom-de-scène-OBS → \`SceneId\` overlay.
 *
 * Fichier régénéré EN ENTIER par dev/obs-scene-map-server.js (section "Renommer les scènes OBS",
 * dev/placement-panel.html) — ne pas éditer à la main pendant que le panneau tourne, la prochaine
 * sauvegarde écraserait les changements. La logique (mapObsSceneToOverlaySceneId) vit dans
 * relay/obs-scene-map.js, jamais régénérée.
 */

/** @type {Record<string, import('../types.js').SceneId>} */
export const OBS_SCENE_MAP = ${JSON.stringify(map, null, 2)};
`;
}
