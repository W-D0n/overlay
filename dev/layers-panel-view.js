// @ts-check
/**
 * dev/layers-panel-view.js — Ce que le panneau de couches affiche, calculé d'une scène : logique pure, sans DOM.
 *
 * Le panneau liste les couches du dessus vers le dessous (comme dans un éditeur graphique), les couches d'identité
 * (branding) toujours en tête puisque le moteur les montre au-dessus des effets.
 *
 * @typedef {import('../src/scene/scene-doc.js').SceneDoc} SceneDoc
 * @typedef {import('../src/scene/scene-doc.js').Layer} Layer
 * @typedef {{
 *   id: string,
 *   title: string,
 *   subtitle: string,
 *   kind: string,
 *   kindLabel: string,
 *   identity: boolean,
 *   visible: boolean,
 *   locked: boolean,
 *   opacityPercent: number,
 *   selected: boolean,
 *   solo: boolean,
 *   dimmed: boolean,
 *   depth: 0 | 1,
 *   group: boolean,
 *   owner: string | null,
 *   collapsed: boolean,
 *   members: number,
 *   hiddenByGroup: boolean,
 *   lockedByGroup: boolean,
 * }} LayerRow
 */
import { MAX_LAYERS, withoutLook } from '../src/scene/scene-doc.js';
import { isGroup, membersOf, relocateLayers } from '../src/layers/layer-group.js';
import { isIdentityKind } from '../src/layers/layer-kinds.js';

/** À partir de combien de couches la jauge prévient : chaque couche d'effet pleine toile est un canvas de plus à dessiner. */
export const LOAD_WARNING_LAYERS = 6;

/**
 * Les lignes du panneau, du dessus vers le dessous. `dimmed` : la couche est masquée par le solo d'une autre couche.
 * A group is a row in front of its members, which come right after it, one level in (`depth`) ; the members of a collapsed group (`collapsed`) have no row.
 * `hiddenByGroup` and `lockedByGroup`: the layer is visible or unlocked itself, but its group is hidden or locked.
 * @param {SceneDoc} scene
 * @param {{ selection: readonly string[], solo: string | null, labelOf: (kind: string) => string, collapsed?: ReadonlySet<string> }} context
 * @returns {LayerRow[]}
 */
export function layerRows(scene, { selection, solo, labelOf, collapsed = new Set() }) {
  const owners = new Map(scene.layers.filter(isGroup).map((layer) => [layer.id, layer]));
  const rows = scene.layers.filter((layer) => layer.group === undefined || !collapsed.has(layer.group)).map((layer) => ({
    id: layer.id,
    title: layer.name ?? labelOf(layer.kind),
    // Le type n'est rappelé que si le nom l'a remplacé ; l'opacité, que si elle n'est pas pleine : pas de répétition.
    subtitle: [layer.name === undefined ? null : labelOf(layer.kind), isGroup(layer) ? membersLabel(membersOf(scene.layers, layer.id).length) : null, layer.opacity < 1 ? `${Math.round(layer.opacity * 100)} %` : null].filter((part) => part !== null).join(' · '),
    kind: layer.kind,
    kindLabel: labelOf(layer.kind),
    identity: isIdentityKind(layer.kind),
    visible: layer.visible,
    locked: layer.locked === true,
    opacityPercent: Math.round(layer.opacity * 100),
    selected: selection.includes(layer.id),
    solo: solo === layer.id,
    dimmed: solo !== null && solo !== layer.id,
    depth: /** @type {0 | 1} */ (layer.group === undefined ? 0 : 1),
    group: isGroup(layer),
    owner: layer.group ?? null,
    collapsed: collapsed.has(layer.id),
    members: isGroup(layer) ? membersOf(scene.layers, layer.id).length : 0,
    hiddenByGroup: layer.group !== undefined && owners.get(layer.group)?.visible === false,
    lockedByGroup: layer.group !== undefined && owners.get(layer.group)?.locked === true,
  }));
  return rows.reverse();
}

/** @param {number} count */
const membersLabel = (count) => `${count} couche${count > 1 ? 's' : ''}`;

/**
 * La jauge de charge : nombre de couches, borne, et un niveau (`ok`, `warn` dès 6, `full` à la borne).
 * @param {SceneDoc} scene
 * @returns {{ count: number, max: number, level: 'ok' | 'warn' | 'full', label: string, hint: string }}
 */
export function loadGauge(scene) {
  // What draws counts: a group is only a container.
  const count = scene.layers.filter((layer) => !isGroup(layer)).length;
  const level = count >= MAX_LAYERS ? 'full' : count >= LOAD_WARNING_LAYERS ? 'warn' : 'ok';
  return {
    count,
    max: MAX_LAYERS,
    level,
    label: `${count} / ${MAX_LAYERS}`,
    hint: level === 'full'
      ? 'Limite atteinte : supprimez ou fusionnez une couche pour en ajouter une.'
      : level === 'warn'
        ? 'Chaque effet pleine toile est un canvas de plus à dessiner dans OBS : gardez la charge sous contrôle.'
        : 'Chaque effet pleine toile est un canvas de plus à dessiner dans OBS.',
  };
}

/**
 * Where to drop dragged layers, from the edge of the row they are over. The list shows the stack from front to back: the top edge of a row is right in front of its layer.
 * Over the bottom edge of an expanded group row, the layers go into the group, at its front ; everywhere else, beside the row.
 * `null` when the drop makes no sense: onto a dragged layer, into the identity layers, a group into a group (it then goes behind the group instead).
 * @param {SceneDoc} scene
 * @param {readonly string[]} movingIds the dragged layers
 * @param {string} overId the row under the pointer
 * @param {'top' | 'bottom'} edge the edge of that row, as displayed
 * @param {ReadonlySet<string>} [collapsed] the groups shown collapsed
 * @returns {import('../src/layers/layer-group.js').DropTarget | null}
 */
export function dropTarget(scene, movingIds, overId, edge, collapsed = new Set()) {
  const over = scene.layers.find((layer) => layer.id === overId);
  if (over === undefined) return null;
  /** @type {import('../src/layers/layer-group.js').DropTarget[]} */
  const candidates = [];
  if (isGroup(over) && !collapsed.has(over.id) && edge === 'bottom') candidates.push({ into: over.id });
  candidates.push({ beside: overId, side: edge === 'top' ? 'front' : 'back' });
  return candidates.find((target) => relocateLayers(scene.layers, movingIds, target) !== null) ?? null;
}

/**
 * The layer alone, full frame, visible and without extended look: the effect itself, what a thumbnail shows.
 * @param {Layer} layer
 * @returns {SceneDoc}
 */
export function aloneScene(layer) {
  // Alone: a member does not bring its group, which the thumbnail scene does not have.
  const { group: _group, ...alone } = withoutLook(layer);
  return {
    version: 1,
    id: 'vignette',
    name: layer.name ?? layer.kind,
    layers: [{ ...alone, visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 } }],
  };
}
