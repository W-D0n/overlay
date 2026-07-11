// @ts-check
/**
 * scenes/registry.js — `SceneId` → config + wire (S3, étendu S8 session 4/6 + migration JSON).
 *
 * `SCENE_CONFIGS` ne contient plus aucune config au chargement du module : les 9 scènes
 * historiques ET les scènes créées par l'éditeur sont désormais chargées uniformément par
 * `loadDynamicScenes()` (`scenes/data/*.scene.json`) — un seul mécanisme d'écriture pour l'éditeur
 * (décision owner, 2026-07-04, voir docs/inbox.md). `*.wire.js` reste du JS statique importé ici :
 * seul le format `SceneConfig` a migré, le câblage impératif des scènes historiques est inchangé.
 *
 * Aucune protection contre suppression/écrasement (risque accepté, owner 2026-07-04, voir
 * docs/inbox.md) : `STATIC_SCENE_IDS` reste vide tant qu'aucune scène n'est réservée.
 */
import { wire as wireDiscussion }    from './discussion.wire.js';
import { wire as wireBrb }           from './brb.wire.js';
import { wire as wireCodage }        from './codage.wire.js';
import { wire as wireJeu }           from './jeu.wire.js';
import { wire as wireInterview }     from './interview.wire.js';
import { wire as wireReact }         from './react.wire.js';
import { wire as wireCreation }      from './creation.wire.js';
import { wire as wireFin }           from './fin.wire.js';
import { STATIC_SCENE_IDS } from './reserved-scene-ids.js';

export { STATIC_SCENE_IDS };

/** @type {Record<string, import('../types.js').SceneConfig>} */
export const SCENE_CONFIGS = {};

/** @type {Record<string, import('../types.js').SceneWire>} */
export const SCENE_WIRES = {
  discussion: wireDiscussion,
  brb: wireBrb,
  codage: wireCodage,
  jeu: wireJeu,
  interview: wireInterview,
  react: wireReact,
  creation: wireCreation,
  fin: wireFin,
};

/**
 * Charge les scènes (JSON, `scenes/data/*.scene.json`, y compris les 9 scènes historiques depuis
 * leur migration S8) et les fusionne dans `SCENE_CONFIGS`. Aucun wire déclaré ici pour une scène
 * chargée dynamiquement : les 9 scènes historiques restent câblées via `SCENE_WIRES` (import
 * statique ci-dessus) ; une scène créée par l'éditeur n'a pas de wire (binding déclaratif
 * $bind/trigger, voir scene-runtime.js §Binding déclaratif).
 *
 * Ne lève jamais : manifeste absent (404), corrompu (JSON invalide) ou de mauvaise forme (pas un
 * tableau) → aucune scène ajoutée (voir docs/specs/scene-definition-v2.md §Session 4/6, edge case
 * "manifeste corrompu").
 *
 * Chemins ABSOLUS (`/scenes/data/...`) — appelé aussi bien depuis `index.html` (racine) que depuis
 * `dev/overlay-setting.html` (sous-dossier) ; un chemin relatif résoudrait différemment selon la
 * page appelante (review S8 session 4/6, migration des 9 scènes).
 *
 * @returns {Promise<void>}
 */
export async function loadDynamicScenes() {
  /** @type {string[]} */
  let manifest;
  try {
    const res = await fetch('/scenes/data/manifest.json');
    const parsed = res.ok ? await res.json() : [];
    if (!Array.isArray(parsed)) {
      console.warn('[overlay] loadDynamicScenes : manifeste de forme invalide (pas un tableau), ignoré');
      return;
    }
    manifest = parsed;
  } catch (err) {
    console.warn('[overlay] loadDynamicScenes : manifeste illisible, ignoré —', err);
    return;
  }

  await Promise.all(manifest.map(async (id) => {
    if (STATIC_SCENE_IDS.includes(id)) {
      console.warn(`[overlay] loadDynamicScenes : id réservé, ignoré — ${id}`);
      return;
    }
    try {
      const res = await fetch(`/scenes/data/${id}.scene.json`);
      if (!res.ok) {
        console.warn(`[overlay] loadDynamicScenes : scène introuvable — ${id}`);
        return;
      }
      SCENE_CONFIGS[id] = await res.json();
    } catch (err) {
      console.warn(`[overlay] loadDynamicScenes : scène illisible — ${id}`, err);
    }
  }));
}
