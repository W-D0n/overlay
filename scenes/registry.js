// @ts-check
/**
 * scenes/registry.js — `SceneId` → config + wire (S3).
 *
 * Agrégation intentionnelle des ressources de scène (config sérialisable ET wire),
 * consommée par le runtime. 3 scènes de référence (S3, AD-4) + `jeu` (pilote S3b) ;
 * les 4 scènes restantes arrivent en S3b.
 */
import { sceneConfig as discussion } from './discussion.config.js';
import { sceneConfig as brb }        from './brb.config.js';
import { sceneConfig as codage }     from './codage.config.js';
import { sceneConfig as jeu }        from './jeu.config.js';
import { sceneConfig as interview }  from './interview.config.js';
import { sceneConfig as react }      from './react.config.js';
import { sceneConfig as creation }   from './creation.config.js';
import { sceneConfig as fin }        from './fin.config.js';
import { sceneConfig as starting }   from './starting.config.js';
import { wire as wireDiscussion }    from './discussion.wire.js';
import { wire as wireBrb }           from './brb.wire.js';
import { wire as wireCodage }        from './codage.wire.js';
import { wire as wireJeu }           from './jeu.wire.js';
import { wire as wireInterview }     from './interview.wire.js';
import { wire as wireReact }         from './react.wire.js';
import { wire as wireCreation }      from './creation.wire.js';
import { wire as wireFin }           from './fin.wire.js';
import { wire as wireStarting }      from './starting.wire.js';

/** @type {Record<string, import('../types.js').SceneConfig>} */
export const SCENE_CONFIGS = { discussion, brb, codage, jeu, interview, react, creation, fin, starting };

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
  starting: wireStarting,
};

/**
 * Ids des 9 scènes statiques, capturés avant toute fusion dynamique (S8 session 4/6) — source de
 * vérité unique, réutilisée par `dev/scene-data-server.js` (au lieu d'une liste dupliquée) et par
 * `loadDynamicScenes` ci-dessous pour interdire à une scène dynamique d'écraser une scène statique.
 * @type {string[]}
 */
export const STATIC_SCENE_IDS = Object.keys(SCENE_CONFIGS);

/**
 * Charge les scènes créées par l'éditeur (JSON, S8 session 4/6) et les fusionne dans
 * `SCENE_CONFIGS`. Aucun wire associé (le binding déclaratif $bind/trigger suffit, voir
 * scene-runtime.js §Binding déclaratif) — cohérent avec le mécanisme "wire optionnel" déjà en place.
 *
 * Ne lève jamais : manifeste absent (404), corrompu (JSON invalide) ou de mauvaise forme (pas un
 * tableau) → aucune scène dynamique ajoutée, les 9 scènes statiques restent fonctionnelles (voir
 * docs/specs/scene-definition-v2.md §Session 4/6, edge case "manifeste corrompu").
 *
 * @returns {Promise<void>}
 */
export async function loadDynamicScenes() {
  /** @type {string[]} */
  let manifest;
  try {
    const res = await fetch('./scenes/data/manifest.json');
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
      console.warn(`[overlay] loadDynamicScenes : id réservé à une scène statique, ignoré — ${id}`);
      return;
    }
    try {
      const res = await fetch(`./scenes/data/${id}.scene.json`);
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
