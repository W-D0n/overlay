// @ts-check
/**
 * relay/obs-scene-map.js — Correspondance nom-de-scène-OBS → `SceneId` overlay (logique pure).
 *
 * Aucun effet de bord : ni réseau, ni DOM, ni temps. Importable par `bun test` et par `server.js`.
 * Les noms de scènes OBS ci-dessous sont des EXEMPLES — l'owner doit les aligner sur les noms
 * réels de ses scènes OBS (aucune convention n'est imposée côté OBS).
 */

/** @type {import('../types.js').SceneId[]} */
const VALID_SCENE_IDS = ['discussion', 'codage', 'brb', 'interview', 'react', 'creation', 'fin', 'jeu'];

/** @type {Record<string, import('../types.js').SceneId>} */
export const OBS_SCENE_MAP = {
  Discussion: 'discussion',
  Codage: 'codage',
  BRB: 'brb',
  Interview: 'interview',
  React: 'react',
  Creation: 'creation',
  Fin: 'fin',
  Jeu: 'jeu',
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
