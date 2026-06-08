// @ts-check
/**
 * scenes/registry.js — `SceneId` → config + wire (S3).
 *
 * Agrégation intentionnelle des ressources de scène (config sérialisable ET wire),
 * consommée par le runtime. Limité aux 3 scènes de référence (AD-4) ; les 5 restantes
 * arrivent en S3b.
 */
import { sceneConfig as discussion } from './discussion.config.js';
import { sceneConfig as brb }        from './brb.config.js';
import { sceneConfig as codage }     from './codage.config.js';
import { wire as wireDiscussion }    from './discussion.wire.js';
import { wire as wireBrb }           from './brb.wire.js';
import { wire as wireCodage }        from './codage.wire.js';

/** @type {Record<string, import('../types.js').SceneConfig>} */
export const SCENE_CONFIGS = { discussion, brb, codage };

/** @type {Record<string, import('../types.js').SceneWire>} */
export const SCENE_WIRES = { discussion: wireDiscussion, brb: wireBrb, codage: wireCodage };
