// @ts-check
/**
 * relay/obs-scene-map-data.js — Table de correspondance nom-de-scène-OBS → `SceneId` overlay.
 *
 * Fichier régénéré EN ENTIER par dev/obs-scene-map-server.js (section "Renommer les scènes OBS",
 * dev/overlay-setting.html) — ne pas éditer à la main pendant que le panneau tourne, la prochaine
 * sauvegarde écraserait les changements. La logique (mapObsSceneToOverlaySceneId) vit dans
 * relay/obs-scene-map.js, jamais régénérée.
 */

/** @type {Record<string, import('../types.js').SceneId>} */
export const OBS_SCENE_MAP = {
  "BRB": "brb",
  "Coding": "codage",
  "Creation": "creation",
  "Just Chatting": "discussion",
  "Ending": "fin",
  "Interview": "interview",
  "Gaming": "jeu",
  "FullScreen": "react",
  "Starting": "starting"
};
