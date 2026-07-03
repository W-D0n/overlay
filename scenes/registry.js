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
