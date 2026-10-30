// @ts-check
/**
 * dev/scene-labels.js — Comment le Studio nomme une scène dans ses listes : ses effets, ses particularités.
 * Pur : le libellé d'un type de couche est fourni.
 *
 * @typedef {import('../scene-doc.js').SceneDoc} SceneDoc
 */
import { isIdentityKind } from '../layer-kinds.js';

/**
 * « Pluie », « Pluie + Bulles » : les effets de la scène, du dessous au dessus ; « Aucun fond » quand elle n'en a pas
 * (le branding seul n'est pas un fond).
 * @param {SceneDoc} scene
 * @param {(kind: string) => string} labelOf
 * @returns {string}
 */
export function sceneEffectsLabel(scene, labelOf) {
  const effects = scene.layers.filter((layer) => !isIdentityKind(layer.kind));
  return effects.length === 0 ? 'Aucun fond' : effects.map((layer) => labelOf(layer.kind)).join(' + ');
}

/**
 * Les couches d'effet d'une scène, du dessous au dessus (hors couches d'identité).
 * @param {SceneDoc} scene
 */
export function effectLayers(scene) {
  return scene.layers.filter((layer) => !isIdentityKind(layer.kind));
}

/**
 * Les particularités qui comptent à la lecture d'une liste : plusieurs couches, transition, branding masqué.
 * @param {SceneDoc} scene
 * @returns {string[]}
 */
export function sceneDetails(scene) {
  /** @type {string[]} */
  const details = [];
  const effects = scene.layers.filter((layer) => !isIdentityKind(layer.kind));
  if (effects.length > 1) details.push(`${effects.length} effets`);
  if (scene.transition !== undefined) details.push(`transition ${scene.transition.type}`);
  if (!scene.layers.some((layer) => layer.kind === 'branding')) details.push('sans branding');
  return details;
}

/**
 * Filtre de recherche d'une liste de scènes : nom, effets et étiquettes, sans casse ni accents.
 * @param {SceneDoc[]} scenes
 * @param {string} query
 * @param {(kind: string) => string} labelOf
 * @returns {SceneDoc[]}
 */
export function filterScenes(scenes, query, labelOf) {
  const fold = (/** @type {unknown} */ value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const needle = fold(query).trim();
  if (needle === '') return scenes;
  return scenes.filter((scene) => fold([scene.name, ...scene.layers.filter((layer) => !isIdentityKind(layer.kind)).map((layer) => labelOf(layer.kind)), ...(scene.tags ?? [])].join(' ')).includes(needle));
}
