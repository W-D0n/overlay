// @ts-check
/**
 * dev/scene-diff.js — Ce qui change entre deux scènes : le récapitulatif lu avant de publier. Logique pure.
 *
 * Les couches se rapprochent par identifiant. Une couche peut être ajoutée, retirée, ou modifiée (type, nom, visibilité,
 * verrou, opacité, position, taille, réglages d'effet) ; l'ordre de la pile et la transition d'arrivée sont comptés à part.
 * Le récapitulatif ne parle que de ce qui se voit à l'antenne : l'identité de la scène, ses étiquettes et la transition d'une
 * simple modification n'en font pas partie (la transition est signalée à part, car elle ne joue qu'à l'arrivée d'un preset).
 *
 * @typedef {import('../scene-doc.js').SceneDoc} SceneDoc
 * @typedef {import('../scene-doc.js').Layer} Layer
 * @typedef {{ layerId: string | null, kind: 'added' | 'removed' | 'changed' | 'order', title: string, details: string[] }} Change
 */
import { BLEND_MODES, CROP_LABELS, CROP_SIDES } from '../scene-doc.js';
import { toDisplay } from './placement-math.js';

/** @param {unknown} value @returns {string} */
function stable(value) {
  return JSON.stringify(value, (_key, nested) => (nested !== null && typeof nested === 'object' && !Array.isArray(nested)
    ? Object.fromEntries(Object.keys(nested).sort().map((key) => [key, nested[key]]))
    : nested));
}

/** @param {unknown} value @returns {string} */
function show(value) {
  if (typeof value === 'number') return String(Math.round(value * 1000) / 1000);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'oui' : 'non';
  if (value === undefined) return '—';
  return stable(value);
}

/**
 * @param {Layer} layer
 * @param {(kind: string) => string} labelOf
 */
const titleOf = (layer, labelOf) => layer.name ?? labelOf(layer.kind);

/**
 * @param {Layer} before
 * @param {Layer} after
 * @param {(kind: string) => string} labelOf
 * @param {(kind: string, key: string) => string} optionLabel
 * @returns {string[]}
 */
function layerDetails(before, after, labelOf, optionLabel) {
  /** @type {string[]} */
  const details = [];
  if (before.kind !== after.kind) details.push(`effet : ${labelOf(before.kind)} → ${labelOf(after.kind)}`);
  if (before.name !== after.name) details.push(`nom : ${before.name ?? labelOf(before.kind)} → ${after.name ?? labelOf(after.kind)}`);
  if (before.visible !== after.visible) details.push(after.visible ? 'affichée' : 'masquée');
  if ((before.locked === true) !== (after.locked === true)) details.push(after.locked === true ? 'verrouillée' : 'déverrouillée');
  if (before.opacity !== after.opacity) details.push(`opacité : ${Math.round(before.opacity * 100)} % → ${Math.round(after.opacity * 100)} %`);
  const blendLabel = (/** @type {Layer} */ layer) => BLEND_MODES.find(({ id }) => id === (layer.blend ?? 'normal'))?.label ?? layer.blend;
  if (before.blend !== after.blend) details.push(`fusion : ${blendLabel(before)} → ${blendLabel(after)}`);
  if ((before.rotation ?? 0) !== (after.rotation ?? 0)) details.push(`rotation : ${before.rotation ?? 0}° → ${after.rotation ?? 0}°`);
  if ((before.blur ?? 0) !== (after.blur ?? 0)) details.push(`flou : ${before.blur ?? 0} px → ${after.blur ?? 0} px`);
  if (stable(before.timeline) !== stable(after.timeline)) {
    const keys = (/** @type {Layer} */ layer) => (layer.timeline ?? []).reduce((total, track) => total + track.keys.length, 0);
    details.push(`animation : ${keys(before)} → ${keys(after)} images clés`);
  }
  if (stable(before.bindings) !== stable(after.bindings)) {
    const count = (/** @type {Layer} */ layer) => layer.bindings?.length ?? 0;
    details.push(`liaisons : ${count(before)} → ${count(after)}`);
  }
  for (const side of CROP_SIDES) {
    const a = Math.round((before.crop?.[side] ?? 0) * 1000) / 10;
    const b = Math.round((after.crop?.[side] ?? 0) * 1000) / 10;
    if (a !== b) details.push(`rognage ${CROP_LABELS[side]} : ${a} % → ${b} %`);
  }
  const labels = { x: 'X', y: 'Y', width: 'largeur', height: 'hauteur' };
  for (const key of /** @type {const} */ (['x', 'y', 'width', 'height'])) {
    const a = toDisplay(key, before.placement[key], 'percent');
    const b = toDisplay(key, after.placement[key], 'percent');
    if (a !== b) details.push(`${labels[key]} : ${a} % → ${b} %`);
  }
  const keys = [...new Set([...Object.keys(before.options), ...Object.keys(after.options)])].sort();
  for (const key of keys) {
    if (stable(before.options[key]) === stable(after.options[key])) continue;
    details.push(`${optionLabel(after.kind, key)} : ${show(before.options[key])} → ${show(after.options[key])}`);
  }
  return details;
}

/**
 * @param {SceneDoc} onAir la scène en antenne
 * @param {SceneDoc} draft le brouillon
 * @param {{ labelOf?: (kind: string) => string, optionLabel?: (kind: string, key: string) => string }} [labels]
 * @returns {Change[]}
 */
export function diffScenes(onAir, draft, { labelOf = (kind) => kind, optionLabel = (_kind, key) => key } = {}) {
  /** @type {Change[]} */
  const changes = [];
  const before = new Map(onAir.layers.map((layer) => [layer.id, layer]));
  const after = new Map(draft.layers.map((layer) => [layer.id, layer]));

  for (const layer of draft.layers) {
    const previous = before.get(layer.id);
    if (previous === undefined) {
      changes.push({ layerId: layer.id, kind: 'added', title: titleOf(layer, labelOf), details: [] });
      continue;
    }
    const details = layerDetails(previous, layer, labelOf, optionLabel);
    if (details.length > 0) changes.push({ layerId: layer.id, kind: 'changed', title: titleOf(layer, labelOf), details });
  }
  for (const layer of onAir.layers) {
    if (!after.has(layer.id)) changes.push({ layerId: layer.id, kind: 'removed', title: titleOf(layer, labelOf), details: [] });
  }

  // Ordre : on compare la suite des identifiants communs aux deux scènes.
  const common = (/** @type {SceneDoc} */ scene, /** @type {Map<string, Layer>} */ other) => scene.layers.filter((layer) => other.has(layer.id)).map(({ id }) => id);
  if (stable(common(onAir, after)) !== stable(common(draft, before))) {
    changes.push({ layerId: null, kind: 'order', title: 'Ordre des couches', details: [] });
  }
  return changes;
}

/**
 * La phrase qui résume un ensemble de changements : « 3 changements ».
 * @param {readonly Change[]} changes
 * @returns {string}
 */
export function summarize(changes) {
  if (changes.length === 0) return 'Aucun changement';
  return `${changes.length} changement${changes.length > 1 ? 's' : ''}`;
}
