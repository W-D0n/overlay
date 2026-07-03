// @ts-check
/**
 * relay/obs-scene-map.js — Correspondance nom-de-scène-OBS → `SceneId` overlay (logique pure).
 *
 * Aucun effet de bord : ni réseau, ni DOM, ni temps. Importable par `bun test` et par `server.js`.
 * Noms de scènes OBS réels de D0n (setup 2026-07-03) — seules 4 scènes OBS existent pour l'instant ;
 * `interview`/`react`/`creation`/`fin` n'ont pas de scène OBS correspondante et restent accessibles
 * uniquement via `POST /emit` (`scene.set` manuel) tant qu'elles n'existent pas côté OBS.
 */

/** @type {import('../types.js').SceneId[]} */
const VALID_SCENE_IDS = ['discussion', 'codage', 'brb', 'interview', 'react', 'creation', 'fin', 'jeu'];

/** @type {Record<string, import('../types.js').SceneId>} */
export const OBS_SCENE_MAP = {
  'Just Chatting': 'discussion',
  'Coding':        'codage',
  'BRB':           'brb',
  'Gaming':        'jeu',
};

/**
 * Traduire un nom de scène OBS en `SceneId` overlay.
 * Ne retourne jamais une valeur hors du domaine `SceneId` (AC-03) — un nom OBS inconnu, absent,
 * ou mappé vers une valeur invalide (erreur de config) renvoie `null`.
 *
 * @param {string} obsSceneName - Nom brut reçu dans `CurrentProgramSceneChanged.eventData.sceneName`
 * @param {Record<string, string>} [map] - Table de correspondance (injectable pour les tests)
 * @returns {import('../types.js').SceneId | null}
 */
export function mapObsSceneToOverlaySceneId(obsSceneName, map = OBS_SCENE_MAP) {
  const mapped = map[obsSceneName];
  return VALID_SCENE_IDS.includes(/** @type {*} */ (mapped)) ? /** @type {import('../types.js').SceneId} */ (mapped) : null;
}
