// @ts-check
import { isIdentityKind } from './layer-kinds.js';

/**
 * layer-group.js — Layer groups: pure structure helpers over the flat layer list of a scene (`scene-doc.js`).
 * No DOM. See docs/specs/groupes-de-couches.md.
 *
 * A group is an entry of kind `group` in the flat list (back to front). Its members carry `group: '<group id>'`
 * and form a contiguous block that ends with the group entry itself. One nesting level only: a group has no `group`
 * field, a member is never a group nor an identity layer (branding). A group has at least one member. Its placement
 * is derived: the bounding box of its members' placements, never typed.
 *
 * @typedef {import('./scene-doc.js').Layer} Layer
 * @typedef {import('./scene-doc.js').Placement} Placement
 */

/** At most this many groups in a scene. */
export const MAX_GROUPS = 4;

export const GROUP_KIND = 'group';

/** @param {{ kind: string }} layer @returns {boolean} */
export function isGroup(layer) {
  return layer.kind === GROUP_KIND;
}

/**
 * The members of a group, back to front.
 * @param {readonly Layer[]} layers
 * @param {string} groupId
 * @returns {Layer[]}
 */
export function membersOf(layers, groupId) {
  return layers.filter((layer) => layer.group === groupId);
}

/**
 * The entries that sit directly in the scene: groups and layers outside any group, back to front.
 * @param {readonly Layer[]} layers
 * @returns {Layer[]}
 */
export function topLevelLayers(layers) {
  return layers.filter((layer) => layer.group === undefined);
}

/**
 * The indexes a layer's block spans: for a group, from its first member to the group entry; for a member, the block of its group;
 * for any other layer, only itself. `null` for an unknown id.
 * @param {readonly Layer[]} layers
 * @param {string} id
 * @returns {{ start: number, end: number } | null}
 */
export function blockRange(layers, id) {
  const at = layers.findIndex((layer) => layer.id === id);
  if (at < 0) return null;
  const owner = layers[at].group ?? (isGroup(layers[at]) ? id : undefined);
  if (owner === undefined) return { start: at, end: at };
  const indexes = layers.flatMap((layer, index) => (layer.id === owner || layer.group === owner ? [index] : []));
  return { start: Math.min(...indexes), end: Math.max(...indexes) };
}

/** Rounded to the millionth: sums of fractions leave float noise (`0.4000000000000001`) that would make the canonical form unstable. @param {number} value */
const tidy = (value) => Math.round(value * 1e6) / 1e6;

/**
 * The bounding box of some placements, rounded to the millionth.
 * @param {readonly Placement[]} placements at least one
 * @returns {Placement}
 */
export function boundingBox(placements) {
  const left = Math.min(...placements.map(({ x }) => x));
  const top = Math.min(...placements.map(({ y }) => y));
  const right = Math.max(...placements.map(({ x, width }) => x + width));
  const bottom = Math.max(...placements.map(({ y, height }) => y + height));
  return { x: tidy(left), y: tidy(top), width: tidy(right - left), height: tidy(bottom - top) };
}

/** @param {Placement} a @param {Placement} b */
const samePlacement = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/**
 * The layers with every group's placement set to the bounding box of its members: the canonical form, where a group never holds a placement of its own.
 * A group without members keeps its placement (validation refuses it). Entries that do not change keep their identity.
 * @param {readonly Layer[]} layers
 * @returns {Layer[]}
 */
export function deriveGroupPlacements(layers) {
  return layers.map((layer) => {
    const members = membersOf(layers, layer.id);
    if (members.length === 0) return layer;
    const box = boundingBox(members.map((member) => member.placement));
    return samePlacement(box, layer.placement) ? layer : { ...layer, placement: box };
  });
}

/**
 * The structural defects of the groups of a scene (empty = valid). French messages: they reach the user (import, publication).
 * @param {readonly Layer[]} layers
 * @returns {string[]}
 */
export function groupErrors(layers) {
  /** @type {string[]} */
  const errors = [];
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const groups = layers.filter(isGroup);
  if (groups.length > MAX_GROUPS) errors.push(`layers : ${MAX_GROUPS} groupes au plus`);

  layers.forEach((layer) => {
    const where = `layers[${layer.id}]`;
    if (isGroup(layer) && layer.group !== undefined) errors.push(`${where}.group : un groupe ne se range pas dans un groupe`);
    if (typeof layer.group !== 'string') return;
    const owner = byId.get(layer.group);
    if (owner === undefined || !isGroup(owner)) errors.push(`${where}.group : groupe « ${layer.group} » introuvable`);
    if (isIdentityKind(layer.kind)) errors.push(`${where}.group : une couche d’identité ne se groupe pas`);
  });

  for (const group of groups) {
    const index = layers.findIndex((layer) => layer.id === group.id);
    const members = membersOf(layers, group.id);
    if (members.length === 0) {
      errors.push(`layers[${group.id}] : un groupe contient au moins une couche`);
      continue;
    }
    // The members are the entries right before the group entry, with no other entry among them.
    const block = layers.slice(index - members.length, index);
    if (index - members.length < 0 || block.some((layer) => layer.group !== group.id)) errors.push(`layers[${group.id}] : les couches d’un groupe se suivent, juste avant lui`);
  }
  return errors;
}

/**
 * Puts layers in a new group. The group block replaces the top-most selected layer's block: the group goes right above the top-most selected layer (or above its group's block).
 * Layers leave their old group; an old group left without members is dissolved. The new group's placement is the box of its members.
 * @param {readonly Layer[]} layers
 * @param {readonly string[]} ids the layers to group, in any order
 * @param {{ id: string, name?: string }} group the new group
 * @returns {Layer[] | null} `null` when nothing valid to group: unknown ids, a group, an identity layer, the group limit
 */
export function groupLayers(layers, ids, group) {
  const wanted = new Set(ids);
  const picked = layers.filter((layer) => wanted.has(layer.id));
  if (picked.length === 0 || picked.length !== wanted.size) return null;
  if (picked.some((layer) => isGroup(layer) || isIdentityKind(layer.kind))) return null;
  if (layers.filter(isGroup).length >= MAX_GROUPS) return null;
  if (layers.some((layer) => layer.id === group.id)) return null;

  // Where the block goes: right after the last entry of the top-most selected layer's block.
  const topmost = picked[picked.length - 1];
  const anchor = /** @type {{ start: number, end: number }} */ (blockRange(layers, topmost.id)).end;

  const members = picked.map((layer) => ({ ...layer, group: group.id }));
  const entry = /** @type {Layer} */ ({
    id: group.id, kind: GROUP_KIND, ...(group.name === undefined ? {} : { name: group.name }), visible: true, opacity: 1,
    placement: { ...members[0].placement }, options: {},
  });

  /** @type {Layer[]} */
  const before = [];
  /** @type {Layer[]} */
  const after = [];
  layers.forEach((layer, index) => {
    if (wanted.has(layer.id)) return;
    (index <= anchor ? before : after).push(layer);
  });
  return dissolveEmptyGroups(deriveGroupPlacements([...before, ...members, entry, ...after]));
}

/**
 * Takes a group apart: its members stay where they are, without the group; the group's own look (opacity, blend, filters, animation…) goes with it.
 * @param {readonly Layer[]} layers
 * @param {string} groupId
 * @returns {Layer[] | null} `null` when `groupId` is not a group
 */
export function ungroupLayers(layers, groupId) {
  const group = layers.find((layer) => layer.id === groupId);
  if (group === undefined || !isGroup(group)) return null;
  return layers
    .filter((layer) => layer.id !== groupId)
    .map((layer) => {
      if (layer.group !== groupId) return layer;
      const { group: _removed, ...member } = layer;
      return member;
    });
}

/**
 * The layers without the groups that have no member left (a group never stays empty), and without a `group` field that points nowhere.
 * @param {readonly Layer[]} layers
 * @returns {Layer[]}
 */
export function dissolveEmptyGroups(layers) {
  const groupIds = new Set(layers.filter(isGroup).map((layer) => layer.id));
  const used = new Set(layers.flatMap((layer) => (layer.group !== undefined && groupIds.has(layer.group) ? [layer.group] : [])));
  return layers
    .filter((layer) => !isGroup(layer) || used.has(layer.id))
    .map((layer) => {
      if (layer.group === undefined || groupIds.has(layer.group)) return layer;
      const { group: _removed, ...free } = layer;
      return free;
    });
}

/**
 * Whether a layer is visible once its group is taken into account.
 * @param {readonly Layer[]} layers @param {Layer} layer
 */
export function isEffectivelyVisible(layers, layer) {
  if (!layer.visible) return false;
  const owner = layer.group === undefined ? undefined : layers.find((candidate) => candidate.id === layer.group);
  return owner === undefined || owner.visible;
}

/**
 * Whether a layer is locked once its group is taken into account: a layer of a locked group is locked.
 * @param {readonly Layer[]} layers @param {Layer} layer
 */
export function isEffectivelyLocked(layers, layer) {
  if (layer.locked === true) return true;
  const owner = layer.group === undefined ? undefined : layers.find((candidate) => candidate.id === layer.group);
  return owner?.locked === true;
}
