// @ts-check
/**
 * relay/obs-scene-map.js — Traduction nom-de-scène-OBS → `SceneId` overlay (logique pure).
 *
 * Aucun effet de bord : ni réseau, ni DOM, ni temps. Importable par `bun test`, `server.js`, ET par
 * `dev/overlay-setting.html`/`dev/dotgrid-tuner.html` (chargés tels quels dans le navigateur — pas
 * de dépendance ici à un import JSON natif, qui exigerait un attribut d'import dédié
 * (`with {type:'json'}`, support récent/fragile selon la version de CEF d'OBS).
 *
 * La donnée (`OBS_SCENE_MAP`) vit dans `obs-scene-map-data.js`, régénérée en entier par
 * `dev/obs-scene-map-server.js` (§OBS "Renommer les scènes OBS", `dev/overlay-setting.html`) — ce
 * fichier-ci (la logique) n'est jamais touché par l'outil d'écriture.
 */
import { OBS_SCENE_MAP } from './obs-scene-map-data.js';

export { OBS_SCENE_MAP };

/** @type {import('../types.js').SceneId[]} */
const VALID_SCENE_IDS = ['discussion', 'codage', 'brb', 'interview', 'react', 'creation', 'fin', 'jeu', 'starting'];

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
