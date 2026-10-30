// @ts-check
import { EFFECT_KIND_IDS, LAYER_KINDS, LAYER_KIND_IDS, NUMBER_FIELD_GUIDANCE } from '../layer-kinds.js';

/**
 * dev/component-field-schemas.js — Vue « formulaire » des types de couche pour le tuner.
 *
 * La description vit dans `layer-kinds.js` (donnée pure, sans dépendance vers les effets) ; ce module
 * ne fait que la présenter sous la forme attendue par le rendu des formulaires.
 *
 * @typedef {import('../layer-kinds.js').FieldSchema} FieldSchema
 */

export { NUMBER_FIELD_GUIDANCE };

/** @type {Record<string, FieldSchema[]>} */
export const BACKGROUND_FIELD_SCHEMAS = Object.fromEntries(
  LAYER_KIND_IDS.map((id) => [id, LAYER_KINDS[id].fields]),
);

/**
 * Options de départ d'un effet : la valeur par défaut de chacun de ses champs, dans un objet neuf.
 * @param {string} kind
 * @returns {Record<string, unknown>}
 */
export function defaultBackgroundOptions(kind) {
  /** @type {Record<string, unknown>} */
  const options = {};
  for (const field of BACKGROUND_FIELD_SCHEMAS[kind]) options[field.key] = field.default;
  return options;
}

/** Noms d'effets proposés par le sélecteur du tuner (`(aucun)` géré à part). */
export const BACKGROUND_COMPONENT_NAMES = EFFECT_KIND_IDS;

/**
 * Libellé affiché d'un effet de fond.
 * @param {string} name
 * @returns {string}
 */
export function backgroundEffectLabel(name) {
  const kind = /** @type {Record<string, { label: string }>} */ (LAYER_KINDS)[name];
  return kind === undefined ? name.replace(/Background$/, '') : kind.label;
}
