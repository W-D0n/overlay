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
import { wire as wireDiscussion }    from './discussion.wire.js';
import { wire as wireBrb }           from './brb.wire.js';
import { wire as wireCodage }        from './codage.wire.js';
import { wire as wireJeu }           from './jeu.wire.js';

/** @type {Record<string, import('../types.js').SceneConfig>} */
export const SCENE_CONFIGS = { discussion, brb, codage, jeu };

/** @type {Record<string, import('../types.js').SceneWire>} */
export const SCENE_WIRES = { discussion: wireDiscussion, brb: wireBrb, codage: wireCodage, jeu: wireJeu };
