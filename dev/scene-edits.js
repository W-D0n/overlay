// @ts-check
/**
 * dev/scene-edits.js — What each structural edit of a scene does, as pure functions: a scene and the arguments in, the new layers (with the history label, the
 * selection to leave and what the command answers) out, or a refusal. The editor (`scene-editor.js`) validates the result, records it in the history and announces it.
 *
 * No state, no clock, no DOM: each edit is tested here on plain scenes.
 *
 * @typedef {import('../scene-doc.js').SceneDoc} SceneDoc
 * @typedef {import('../scene-doc.js').Layer} Layer
 * @typedef {{ ok: false, reason: 'limit' | 'unique' | 'unknown' | 'invalid' | 'empty', message: string }} Refused
 * @typedef {{ ok: true, unchanged: true }} Unchanged
 * @typedef {{
 *   ok: true,
 *   layers: Layer[],
 *   label: string,
 *   selection: string[],
 *   result?: Record<string, unknown>,
 *   operation?: { op: string, ids: string[], args: Record<string, unknown> },
 * }} Planned `result`: what the command answers besides `ok`; `operation`: what a recorded macro keeps of it (absent: the edit is not recorded)
 * @typedef {Refused | Unchanged | Planned} Plan
 */
import { MAX_LAYERS, createLayer } from '../scene-doc.js';
import { animationFits } from '../layer-animation.js';
import {
  MAX_GROUPS, blockRange, dissolveEmptyGroups, groupLayers, isGroup, membersOf, reorderItems, selectionRoots, topLevelBlocks, ungroupLayers, withMembers,
} from '../layer-group.js';
import { isGroupKind, isIdentityKind, kindCapabilities, kindFamily, resolveKindId } from '../layer-kinds.js';

/** @param {Refused['reason']} reason @param {string} message @returns {Refused} */
export const refuse = (reason, message) => ({ ok: false, reason, message });

/** The layers that draw: a group draws nothing, the load guard counts the others. @param {readonly Layer[]} layers */
export const drawnCount = (layers) => layers.filter((layer) => !isGroup(layer)).length;

/**
 * An id free in the scene, built on `base` (`rain`, `rain-2`, …).
 * @param {SceneDoc} scene
 * @param {string} base
 */
export function uniqueLayerId(scene, base) {
  const stem = base.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'couche';
  const used = new Set(scene.layers.map(({ id }) => id));
  if (!used.has(stem)) return stem;
  for (let n = 2; ; n += 1) if (!used.has(`${stem}-${n}`)) return `${stem}-${n}`;
}

/** @param {SceneDoc} scene @param {string[]} ids @returns {string[]} the ids present in the scene, without duplicates, in the order of the layers */
export function knownIds(scene, ids) {
  const wanted = new Set(ids);
  return scene.layers.filter(({ id }) => wanted.has(id)).map(({ id }) => id);
}

/**
 * Where a new layer goes: right above the selection, otherwise at the top of the effects ; an effect stays under the identity layers, an identity layer above the effects.
 * Above a layer of a group, it goes into that group's block and joins the group; above a group, it goes above the whole block.
 * @param {Layer[]} layers
 * @param {boolean} identity
 * @param {readonly string[]} selection
 * @returns {{ index: number, group?: string }}
 */
function insertionPoint(layers, identity, selection) {
  const effects = layers.filter(({ kind }) => !isIdentityKind(kind)).length;
  if (identity) return { index: layers.length };
  const anchor = selection.length === 0 ? -1 : Math.max(...selection.map((id) => layers.findIndex((layer) => layer.id === id)));
  if (anchor < 0 || anchor >= effects) return { index: effects };
  const group = layers[anchor].group;
  return group === undefined ? { index: anchor + 1 } : { index: anchor + 1, group };
}

/**
 * Adds a layer (selected afterwards).
 * @param {SceneDoc} scene
 * @param {readonly string[]} selection
 * @param {{ kind: string, name?: string, options?: Record<string, unknown>, placement?: Partial<import('../scene-doc.js').Placement>, opacity?: number }} input
 * @returns {Plan}
 */
export function planAddLayer(scene, selection, { kind, name, options, placement, opacity }) {
  const resolved = resolveKindId(kind);
  if (resolved === null) return refuse('invalid', `type de couche inconnu : ${kind}`);
  if (isGroupKind(resolved)) return refuse('invalid', 'un groupe se crée en groupant des couches');
  if (drawnCount(scene.layers) >= MAX_LAYERS) return refuse('limit', `${MAX_LAYERS} couches au plus`);
  if (isIdentityKind(resolved) && scene.layers.some((layer) => layer.kind === resolved)) {
    return refuse('unique', 'cette couche existe déjà dans la scène');
  }
  const id = uniqueLayerId(scene, resolved);
  const point = insertionPoint(scene.layers, isIdentityKind(resolved), selection);
  const layer = createLayer({
    id,
    kind: resolved,
    ...(point.group === undefined ? {} : { group: point.group }),
    ...(name === undefined ? {} : { name }),
    ...(options === undefined ? {} : { options }),
    ...(opacity === undefined ? {} : { opacity }),
    ...(placement === undefined ? {} : { placement: { x: 0, y: 0, width: 1, height: 1, ...placement } }),
  });
  const layers = [...scene.layers];
  layers.splice(point.index, 0, layer);
  return {
    ok: true,
    layers,
    label: 'Ajouter une couche',
    selection: [id],
    result: { id },
    operation: { op: 'addLayer', ids: [id], args: { kind: resolved, ...(name === undefined ? {} : { name }), ...(options === undefined ? {} : { options }), ...(placement === undefined ? {} : { placement }), ...(opacity === undefined ? {} : { opacity }) } },
  };
}

/**
 * Removes layers: a group takes its members with it, and a group left without members goes too.
 * @param {SceneDoc} scene
 * @param {readonly string[]} selection
 * @param {string[]} ids
 * @returns {Plan}
 */
export function planRemoveLayers(scene, selection, ids) {
  const targets = knownIds(scene, ids);
  if (targets.length === 0) return refuse('unknown', 'aucune couche à supprimer');
  const removed = withMembers(scene.layers, targets);
  const layers = dissolveEmptyGroups(scene.layers.filter(({ id }) => !removed.includes(id)));
  return {
    ok: true,
    layers,
    label: targets.length === 1 ? 'Supprimer une couche' : `Supprimer ${targets.length} couches`,
    selection: selection.filter((id) => !removed.includes(id) && layers.some((layer) => layer.id === id)),
    operation: { op: 'removeLayers', ids: targets, args: {} },
  };
}

/**
 * Copies each layer above its original (the copy of an identity layer is refused: it is unique). A group is copied with its layers, as a new block above it; the copy of a layer
 * of a group stays in the group.
 * @param {SceneDoc} scene
 * @param {string[]} ids
 * @returns {Plan}
 */
export function planDuplicateLayers(scene, ids) {
  const find = (/** @type {string} */ id) => /** @type {Layer} */ (scene.layers.find((layer) => layer.id === id));
  const targets = selectionRoots(scene.layers, knownIds(scene, ids));
  if (targets.length === 0) return refuse('unknown', 'aucune couche à dupliquer');
  if (targets.some((id) => isIdentityKind(find(id).kind))) return refuse('unique', 'une couche d’identité ne se duplique pas');
  const copiedGroups = targets.filter((id) => isGroup(find(id)));
  const copiedDrawn = targets.reduce((sum, id) => sum + (copiedGroups.includes(id) ? membersOf(scene.layers, id).length : 1), 0);
  if (drawnCount(scene.layers) + copiedDrawn > MAX_LAYERS) return refuse('limit', `${MAX_LAYERS} couches au plus`);
  if (scene.layers.filter(isGroup).length + copiedGroups.length > MAX_GROUPS) return refuse('limit', `${MAX_GROUPS} groupes au plus`);
  /** @type {Layer[]} */
  const layers = [];
  /** @type {string[]} */
  const copies = [];
  /** A copy of a layer under a new identifier, unlocked. @param {Layer} layer @param {Partial<Layer>} [over] */
  const copyOf = (layer, over = {}) => {
    const { locked: _locked, ...unlocked } = structuredClone(layer);
    const id = uniqueLayerId({ ...scene, layers }, layer.id.replace(/-\d+$/, ''));
    return { ...unlocked, id, ...(layer.name === undefined ? {} : { name: `${layer.name} copie` }), ...over };
  };
  for (const layer of scene.layers) {
    layers.push(layer);
    if (!targets.includes(layer.id)) continue;
    if (!isGroup(layer)) {
      const copy = copyOf(layer);
      copies.push(copy.id);
      layers.push(copy);
      continue;
    }
    // The group entry ends its block: the copy of the block goes right above it, members first.
    const groupCopy = copyOf(layer);
    for (const member of membersOf(scene.layers, layer.id)) layers.push(copyOf(member, { group: groupCopy.id }));
    layers.push(groupCopy);
    copies.push(groupCopy.id);
  }
  return {
    ok: true,
    layers,
    label: targets.length === 1 ? 'Dupliquer une couche' : `Dupliquer ${targets.length} couches`,
    selection: copies,
    result: { ids: copies },
    operation: { op: 'duplicateLayers', ids: targets, args: {} },
  };
}

/**
 * Moves layers, never across the boundary between effects and identity layers. A group moves as a block with its layers; the layers of one group are reordered inside the group;
 * a selection spread between the top of the scene and a group, or between several groups, is refused.
 * @param {SceneDoc} scene
 * @param {readonly string[]} selection
 * @param {string[]} ids
 * @param {'up' | 'down' | 'top' | 'bottom' | { to: number }} where
 * @returns {Plan}
 */
export function planMoveLayers(scene, selection, ids, where) {
  const find = (/** @type {string} */ id) => /** @type {Layer} */ (scene.layers.find((layer) => layer.id === id));
  const targets = selectionRoots(scene.layers, knownIds(scene, ids));
  if (targets.length === 0) return refuse('unknown', 'aucune couche à déplacer');
  const owners = new Set(targets.map((id) => find(id).group));
  if (owners.size > 1) return refuse('invalid', 'la sélection est répartie entre plusieurs groupes ou à la fois dans un groupe et hors de tout groupe');
  const [owner] = owners;
  /** @type {Layer[]} */
  let layers;
  if (owner === undefined) {
    const identity = isIdentityKind(find(targets[0]).kind);
    const blocks = topLevelBlocks(scene.layers).filter((block) => isIdentityKind(block.layers[0].kind) === identity);
    if (targets.some((id) => !blocks.some((block) => block.id === id))) return refuse('invalid', 'effets et couches d’identité ne se mélangent pas');
    const reordered = reorderItems(blocks, targets, where).flatMap((block) => block.layers);
    const others = scene.layers.filter((layer) => !reordered.includes(layer));
    layers = identity ? [...others, ...reordered] : [...reordered, ...others];
  } else {
    // Inside a group: only the members move, the block stays where it is.
    const members = membersOf(scene.layers, owner);
    const reordered = reorderItems(members, targets, where);
    const range = /** @type {{ start: number, end: number }} */ (blockRange(scene.layers, owner));
    layers = [...scene.layers.slice(0, range.start), ...reordered, ...scene.layers.slice(range.end)];
  }
  if (layers.every((layer, index) => layer === scene.layers[index])) return { ok: true, unchanged: true };
  return { ok: true, layers, label: 'Réordonner', selection: [...selection], operation: { op: 'moveLayers', ids: targets, args: { where } } };
}

/**
 * Inserts layers that come from elsewhere (a paste): new ids, right above the selection, selected afterwards. All or nothing: when the layer limit would be exceeded or the
 * branding already exists, nothing is inserted.
 * @param {SceneDoc} scene
 * @param {readonly string[]} selection
 * @param {Layer[]} incoming
 * @param {string} [entryLabel] the name of the history entry (default « Coller … »)
 * @returns {Plan}
 */
export function planInsertLayers(scene, selection, incoming, entryLabel) {
  if (incoming.length === 0) return refuse('empty', 'rien à coller');
  if (drawnCount(scene.layers) + drawnCount(incoming) > MAX_LAYERS) return refuse('limit', `${MAX_LAYERS} couches au plus`);
  if (scene.layers.filter(isGroup).length + incoming.filter(isGroup).length > MAX_GROUPS) return refuse('limit', `${MAX_GROUPS} groupes au plus`);
  if (incoming.some((layer) => isIdentityKind(layer.kind) && scene.layers.some((existing) => existing.kind === layer.kind))) {
    return refuse('unique', 'cette couche existe déjà dans la scène');
  }
  /** The new identifier of each pasted layer: the references of pasted members follow their group. @type {Map<string, string>} */
  const renamed = new Map();
  /** @type {Layer[]} */
  const added = [];
  for (const layer of incoming) {
    const id = uniqueLayerId({ ...scene, layers: [...scene.layers, ...added] }, layer.id.replace(/-\d+$/, ''));
    renamed.set(layer.id, id);
    added.push({ ...layer, id });
  }
  const pasted = added.map((layer, index) => {
    const { locked: _locked, group, ...rest } = structuredClone(layer);
    // A member keeps its group when the group is pasted with it, and otherwise pastes as a free layer.
    const owner = incoming[index].group === undefined ? undefined : renamed.get(incoming[index].group);
    return /** @type {Layer} */ ({ ...rest, ...(owner === undefined ? {} : { group: owner }) });
  });
  const layers = [...scene.layers];
  const effects = pasted.filter((layer) => !isIdentityKind(layer.kind));
  const identities = pasted.filter((layer) => isIdentityKind(layer.kind));
  const point = insertionPoint(layers, false, selection);
  // Free layers pasted above a layer of a group join that group ; a pasted group goes above the whole block it was pasted over.
  const hasGroup = effects.some(isGroup);
  const index = point.group !== undefined && hasGroup ? /** @type {{ end: number }} */ (blockRange(layers, point.group)).end + 1 : point.index;
  const joining = point.group !== undefined && !hasGroup ? point.group : undefined;
  layers.splice(index, 0, ...effects.map((layer) => (joining !== undefined && layer.group === undefined ? { ...layer, group: joining } : layer)));
  layers.push(...identities);
  const ids = pasted.map(({ id }) => id);
  return { ok: true, layers, label: entryLabel ?? (pasted.length === 1 ? 'Coller une couche' : `Coller ${pasted.length} couches`), selection: ids, result: { ids } };
}

/**
 * Groups layers: they gather in a new group, which goes above the top-most of them and is selected.
 * @param {SceneDoc} scene
 * @param {string[]} ids
 * @returns {Plan}
 */
export function planGroupLayers(scene, ids) {
  const targets = knownIds(scene, ids);
  if (targets.length === 0) return refuse('unknown', 'aucune couche à grouper');
  if (scene.layers.filter(isGroup).length >= MAX_GROUPS) return refuse('limit', `${MAX_GROUPS} groupes au plus`);
  const id = uniqueLayerId(scene, 'group');
  const layers = groupLayers(scene.layers, targets, { id });
  if (layers === null) return refuse('invalid', 'seules des couches se groupent : ni un groupe, ni une couche d’identité');
  return {
    ok: true,
    layers,
    label: targets.length === 1 ? 'Grouper une couche' : `Grouper ${targets.length} couches`,
    selection: [id],
    result: { id },
    operation: { op: 'groupLayers', ids: targets, args: {} },
  };
}

/**
 * Takes groups apart: the groups among `ids`, and those of the layers among them. The members stay where they are and are selected ; the group's own look is lost with it.
 * @param {SceneDoc} scene
 * @param {string[]} ids
 * @returns {Plan}
 */
export function planUngroupLayers(scene, ids) {
  const groups = [...new Set(knownIds(scene, ids).flatMap((id) => {
    const layer = /** @type {Layer} */ (scene.layers.find((candidate) => candidate.id === id));
    return isGroup(layer) ? [layer.id] : layer.group === undefined ? [] : [layer.group];
  }))];
  if (groups.length === 0) return refuse('invalid', 'aucun groupe à dégrouper');
  const freed = groups.flatMap((id) => membersOf(scene.layers, id).map((member) => member.id));
  let layers = scene.layers;
  for (const id of groups) layers = /** @type {Layer[]} */ (ungroupLayers(layers, id));
  return {
    ok: true,
    layers,
    label: groups.length === 1 ? 'Dégrouper' : `Dégrouper ${groups.length} groupes`,
    selection: freed,
    result: { ids: freed },
    operation: { op: 'ungroupLayers', ids: groups, args: {} },
  };
}

/**
 * Changes the effect of a layer: new kind, starting options of the new kind. The placement, opacity, visibility, lock and place in the stack stay the layer's.
 * @param {SceneDoc} scene
 * @param {readonly string[]} selection
 * @param {string} id
 * @param {string} kind
 * @param {Record<string, unknown>} options
 * @returns {Plan}
 */
export function planSetLayerKind(scene, selection, id, kind, options) {
  const layer = scene.layers.find((candidate) => candidate.id === id);
  if (layer === undefined) return refuse('unknown', `couche introuvable : ${id}`);
  const resolved = resolveKindId(kind);
  if (resolved === null) return refuse('invalid', `type de couche inconnu : ${kind}`);
  if (kindFamily(resolved) !== kindFamily(layer.kind)) return refuse('invalid', 'un effet, un contenu et une couche d’identité ne se remplacent pas entre eux');
  if (isIdentityKind(resolved) && scene.layers.some((other) => other.id !== id && other.kind === resolved)) {
    return refuse('unique', 'cette couche existe déjà dans la scène');
  }
  if (resolved === layer.kind) return { ok: true, unchanged: true };
  if (!animationFits(layer.animation, kindCapabilities(resolved).content)) return refuse('invalid', 'cette couche a une entrée ou une sortie propre à son contenu (texte ou forme) : choisissez-en une autre avant de changer son type');
  const layers = scene.layers.map((candidate) => (candidate.id === id ? { ...candidate, kind: resolved, options } : candidate));
  return { ok: true, layers, label: 'Changer l’effet', selection: [...selection], operation: { op: 'setLayerKind', ids: [id], args: { kind: resolved, options } } };
}
