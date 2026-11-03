// @ts-check
/**
 * dev/scene-editor.js — Le modèle d'édition d'une scène : la scène brouillon, sa sélection et son historique.
 *
 * Un seul objet détient la scène en cours d'édition. Toute modification passe par une commande atomique qui rend
 * `{ ok: true, … }` ou `{ ok: false, reason, message }` et laisse l'état intact en cas de refus. Garanties :
 *  - la scène détenue est **toujours valide** (`validateSceneDoc`, 0 à 8 couches) : une commande qui la rendrait
 *    invalide est refusée, jamais appliquée à moitié ;
 *  - chaque commande réussie est **une** entrée d'historique (annulable d'un coup) ; les réglages continus (curseur,
 *    glissement) passent une `coalesceKey` et se regroupent en une entrée tant qu'ils se suivent à moins de `coalesceMs` ;
 *  - rien n'est modifié sur place : les scènes de l'historique restent intactes ;
 *  - les couches d'identité (branding) restent au-dessus des effets, au plus une par type.
 *
 * Le verrou (`locked`) est une donnée de la scène : il protège la couche de la manipulation à la souris, il n'empêche pas un
 * réglage explicite (champ numérique, commande). Le solo est un état de vue, jamais écrit dans la scène.
 *
 * Aucun DOM, aucune horloge propre (`now` est injecté), aucun disque : testable seul.
 *
 * @typedef {import('../scene-doc.js').SceneDoc} SceneDoc
 * @typedef {import('../scene-doc.js').Layer} Layer
 * @typedef {import('../scene-doc.js').Placement} Placement
 * @typedef {{ scene: SceneDoc, selection: string[], solo: string | null, canUndo: boolean, canRedo: boolean, dirty: boolean, undoLabel: string | null, redoLabel: string | null }} EditorState
 * @typedef {{ ok: true }} Done
 * @typedef {{ ok: false, reason: 'limit' | 'unique' | 'unknown' | 'invalid' | 'empty', message: string }} Refused
 * @typedef {{ coalesceKey?: string }} CoalesceOptions
 * @typedef {import('./operation-steps.js').EditorOperation} EditorOperation
 * @typedef {ReturnType<typeof createSceneEditor>} SceneEditor
 */
import { MAX_LAYERS, canonicalSceneDoc, createLayer, validateSceneDoc, withoutLook } from '../scene-doc.js';
import { animationFits } from '../layer-animation.js';
import {
  MAX_GROUPS, blockRange, boundingBox, dissolveEmptyGroups, groupLayers, isGroup, membersOf, relocateLayers, reorderItems, resizeGroup, selectionRoots, topLevelBlocks, ungroupLayers, withMembers,
} from '../layer-group.js';
import { isGroupKind, isIdentityKind, kindCapabilities, kindFamily, resolveKindId } from '../layer-kinds.js';

const DEFAULT_HISTORY_LIMIT = 200;
const DEFAULT_COALESCE_MS = 800;
const PLACEMENT_KEYS = ['x', 'y', 'width', 'height'];
const LAYER_PATCH_KEYS = ['name', 'visible', 'locked', 'opacity', 'blend', 'rotation', 'crop', 'blur', 'bindings', 'timeline', 'animation', 'filters', 'mask'];

/** The layers that draw: a group draws nothing, the load guard counts the others. @param {readonly Layer[]} layers */
const drawnCount = (layers) => layers.filter((layer) => !isGroup(layer)).length;

/**
 * The layers with new placements. A group takes a box: its members move and scale with it, and a member patched together with its group follows the group.
 * @param {readonly Layer[]} layers
 * @param {Record<string, Partial<Placement>>} patches
 * @returns {Layer[] | null} `null` when a group's new box would have no area (or the group has no members)
 */
function placeLayers(layers, patches) {
  /** @type {Layer[]} */
  let result = [...layers];
  for (const id of selectionRoots(layers, Object.keys(patches))) {
    const layer = result.find((candidate) => candidate.id === id);
    if (layer === undefined) continue;
    if (!isGroup(layer)) {
      result = result.map((candidate) => (candidate.id === id ? { ...candidate, placement: { ...candidate.placement, ...patches[id] } } : candidate));
      continue;
    }
    const moved = resizeGroup(result, id, { ...boundingBox(membersOf(result, id).map((member) => member.placement)), ...patches[id] });
    if (moved === null) return null;
    result = moved;
  }
  return result;
}

/** @param {string} message @param {Refused['reason']} reason @returns {Refused} */
const refuse = (reason, message) => ({ ok: false, reason, message });

/** JSON dont l'ordre des clés ne compte pas : deux scènes égales s'écrivent pareil. @param {unknown} value @returns {string} */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = /** @type {Record<string, unknown>} */ (value);
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Un identifiant de couche libre dans la scène, bâti sur `base` (`rain`, `rain-2`, …).
 * @param {SceneDoc} scene
 * @param {string} base
 */
export function uniqueLayerId(scene, base) {
  const stem = base.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'couche';
  const used = new Set(scene.layers.map(({ id }) => id));
  if (!used.has(stem)) return stem;
  for (let n = 2; ; n += 1) if (!used.has(`${stem}-${n}`)) return `${stem}-${n}`;
}

/**
 * La scène telle que l'aperçu doit la montrer quand une couche est en solo : les autres couches sont masquées (jamais
 * supprimées, jamais écrites dans la scène brouillon).
 * @param {SceneDoc} scene
 * @param {string | null} solo
 * @returns {SceneDoc}
 */
export function viewScene(scene, solo) {
  const soloed = solo === null ? undefined : scene.layers.find(({ id }) => id === solo);
  if (soloed === undefined) return scene;
  // A layer of a group needs its group to be seen; a group needs its members.
  const kept = new Set([soloed.id, ...(soloed.group === undefined ? [] : [soloed.group]), ...membersOf(scene.layers, soloed.id).map(({ id }) => id)]);
  return { ...scene, layers: scene.layers.map((layer) => (kept.has(layer.id) ? layer : { ...layer, visible: false })) };
}

/**
 * @param {{
 *   scene: SceneDoc,
 *   now?: () => number,
 *   historyLimit?: number,
 *   coalesceMs?: number,
 * }} options
 */
export function createSceneEditor({ scene: initial, now = Date.now, historyLimit = DEFAULT_HISTORY_LIMIT, coalesceMs = DEFAULT_COALESCE_MS }) {
  /** @typedef {{ scene: SceneDoc, selection: string[], label: string, at: number }} Snapshot */
  /** @type {SceneDoc} */
  let scene = initial;
  /** @type {string[]} */
  let selection = [];
  /** @type {string | null} */
  let solo = null;
  /** @type {Snapshot[]} états *avant* chaque entrée, la plus récente en dernier */
  let past = [];
  /** @type {Snapshot[]} états défaits, le prochain à rétablir en dernier */
  let future = [];
  /** @type {{ key: string, at: number } | null} */
  let lastCoalesce = null;
  let label = '';
  /** L'heure de l'entrée courante (celle que `label` nomme). */
  let labelAt = 0;
  let baseline = stableStringify(initial);
  /** @type {Set<(state: EditorState) => void>} */
  const listeners = new Set();
  /** Le lot de commandes en cours (`batch`), ou `null`. @type {{ before: { scene: SceneDoc, selection: string[] } | null } | null} */
  let batch = null;
  /** @type {EditorState | null} */
  let cached = null;
  /** @type {Set<(operation: EditorOperation) => void>} */
  const operationListeners = new Set();

  /**
   * Annonce une opération réussie (de quoi enregistrer une macro). Rend le résultat tel quel.
   * @template {{ ok: boolean }} R
   * @param {R} result
   * @param {string} op
   * @param {string[]} ids
   * @param {Record<string, unknown>} args
   * @param {Record<string, Record<string, number>>} [before]
   * @returns {R}
   */
  function announce(result, op, ids, args, before) {
    if (result.ok && operationListeners.size > 0) {
      const operation = { op, ids: [...ids], args: structuredClone(args), ...(before === undefined ? {} : { before }) };
      for (const listener of [...operationListeners]) listener(operation);
    }
    return result;
  }

  function state() {
    if (cached === null) {
      cached = {
        scene,
        selection,
        solo,
        canUndo: past.length > 0,
        canRedo: future.length > 0,
        dirty: stableStringify(scene) !== baseline,
        undoLabel: past.length === 0 ? null : label,
        redoLabel: future.length === 0 ? null : future[future.length - 1].label,
      };
    }
    return cached;
  }

  function notify() {
    cached = null;
    const snapshot = state();
    for (const listener of [...listeners]) listener(snapshot);
  }

  /**
   * Enregistre un changement de scène (et de sélection) comme une entrée d'historique, ou le fond dans l'entrée précédente
   * quand `coalesceKey` se répète assez vite.
   * @param {string} entryLabel
   * @param {SceneDoc} next
   * @param {string[]} [nextSelection]
   * @param {string} [coalesceKey]
   */
  function commit(entryLabel, next, nextSelection = selection, coalesceKey) {
    if (batch !== null) {
      // Dans un lot : l'état d'avant la première commande est gardé, rien n'est empilé ni notifié avant la fin.
      if (batch.before === null) batch.before = { scene, selection };
      scene = next;
      selection = nextSelection;
      future = [];
      lastCoalesce = null;
      if (solo !== null && !scene.layers.some(({ id }) => id === solo)) solo = null;
      cached = null;
      return;
    }
    const at = now();
    const merges = coalesceKey !== undefined && lastCoalesce !== null && lastCoalesce.key === coalesceKey
      && at - lastCoalesce.at <= coalesceMs && past.length > 0;
    if (!merges) {
      past.push({ scene, selection, label: entryLabel, at });
      if (past.length > historyLimit) past = past.slice(past.length - historyLimit);
    }
    scene = next;
    selection = nextSelection;
    label = merges ? label : entryLabel;
    labelAt = merges ? labelAt : at;
    future = [];
    lastCoalesce = coalesceKey === undefined ? null : { key: coalesceKey, at };
    if (solo !== null && !scene.layers.some(({ id }) => id === solo)) solo = null;
    notify();
  }

  /**
   * Canonise puis valide : la scène détenue est valide ou la commande est refusée.
   * @param {SceneDoc} candidate
   * @returns {{ ok: true, scene: SceneDoc } | Refused}
   */
  function accept(candidate) {
    const canonical = canonicalSceneDoc(candidate);
    const validation = validateSceneDoc(canonical, { allowEmpty: true });
    return validation.ok ? { ok: true, scene: canonical } : refuse('invalid', validation.errors.join(' ; '));
  }

  /** @param {string[]} ids @returns {string[]} les identifiants présents dans la scène, sans doublon, dans l'ordre des couches */
  function known(ids) {
    const wanted = new Set(ids);
    return scene.layers.filter(({ id }) => wanted.has(id)).map(({ id }) => id);
  }

  /** @param {string} id */
  const find = (id) => scene.layers.find((layer) => layer.id === id);

  /**
   * Where a new layer goes: right above the selection, otherwise at the top of the effects ; an effect stays under the identity layers, an identity layer above the effects.
   * Above a layer of a group, it goes into that group's block and joins the group; above a group, it goes above the whole block.
   * @param {Layer[]} layers
   * @param {boolean} identity
   * @returns {{ index: number, group?: string }}
   */
  function insertionPoint(layers, identity) {
    const effects = layers.filter(({ kind }) => !isIdentityKind(kind)).length;
    if (identity) return { index: layers.length };
    const anchor = selection.length === 0 ? -1 : Math.max(...selection.map((id) => layers.findIndex((layer) => layer.id === id)));
    if (anchor < 0 || anchor >= effects) return { index: effects };
    const group = layers[anchor].group;
    return group === undefined ? { index: anchor + 1 } : { index: anchor + 1, group };
  }

  return {
    state,

    /**
     * Prévenu après chaque opération d'édition réussie (hors annuler / rétablir, collage et chargement) : de quoi enregistrer
     * une macro à partir des gestes directs.
     * @param {(operation: EditorOperation) => void} listener
     * @returns {() => void}
     */
    onOperation(listener) {
      operationListeners.add(listener);
      return () => operationListeners.delete(listener);
    },

    /** @param {(state: EditorState) => void} listener @returns {() => void} */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Repart d'une scène : nouvelle base de comparaison, historique et sélection vidés. @param {SceneDoc} next */
    load(next) {
      scene = next;
      selection = [];
      solo = null;
      past = [];
      future = [];
      lastCoalesce = null;
      label = '';
      labelAt = 0;
      baseline = stableStringify(next);
      notify();
    },

    /** La scène détenue devient la référence (après une publication ou un enregistrement réussi). */
    markSaved() {
      baseline = stableStringify(scene);
      notify();
    },

    /**
     * @param {string[]} ids
     * @param {'replace' | 'add' | 'toggle'} [mode]
     */
    select(ids, mode = 'replace') {
      const wanted = known(ids);
      const next = mode === 'replace' ? wanted
        : mode === 'add' ? known([...selection, ...wanted])
          : known([...selection.filter((id) => !wanted.includes(id)), ...wanted.filter((id) => !selection.includes(id))]);
      if (stableStringify(next) === stableStringify(selection)) return;
      selection = next;
      notify();
    },
    selectAll() {
      this.select(scene.layers.map(({ id }) => id));
    },
    clearSelection() {
      this.select([]);
    },

    /** @param {string | null} id */
    setSolo(id) {
      const next = id !== null && find(id) !== undefined ? id : null;
      if (next === solo) return;
      solo = next;
      notify();
    },

    /**
     * Ajoute une couche (sélectionnée ensuite).
     * @param {{ kind: string, name?: string, options?: Record<string, unknown>, placement?: Partial<Placement>, opacity?: number }} input
     * @returns {(Done & { id: string }) | Refused}
     */
    addLayer({ kind, name, options, placement, opacity }) {
      const resolved = resolveKindId(kind);
      if (resolved === null) return refuse('invalid', `type de couche inconnu : ${kind}`);
      if (isGroupKind(resolved)) return refuse('invalid', 'un groupe se crée en groupant des couches');
      if (drawnCount(scene.layers) >= MAX_LAYERS) return refuse('limit', `${MAX_LAYERS} couches au plus`);
      if (isIdentityKind(resolved) && scene.layers.some((layer) => layer.kind === resolved)) {
        return refuse('unique', 'cette couche existe déjà dans la scène');
      }
      const id = uniqueLayerId(scene, resolved);
      const point = insertionPoint(scene.layers, isIdentityKind(resolved));
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
      const accepted = accept({ ...scene, layers });
      if (!accepted.ok) return accepted;
      commit('Ajouter une couche', accepted.scene, [id]);
      return announce({ ok: true, id }, 'addLayer', [id], { kind: resolved, ...(name === undefined ? {} : { name }), ...(options === undefined ? {} : { options }), ...(placement === undefined ? {} : { placement }), ...(opacity === undefined ? {} : { opacity }) });
    },

    /**
     * @param {string[]} ids
     * @returns {Done | Refused}
     */
    removeLayers(ids) {
      const targets = known(ids);
      if (targets.length === 0) return refuse('unknown', 'aucune couche à supprimer');
      // A group takes its members with it ; a group left without members goes too.
      const removed = withMembers(scene.layers, targets);
      const accepted = accept({ ...scene, layers: dissolveEmptyGroups(scene.layers.filter(({ id }) => !removed.includes(id))) });
      if (!accepted.ok) return accepted;
      commit(targets.length === 1 ? 'Supprimer une couche' : `Supprimer ${targets.length} couches`, accepted.scene, selection.filter((id) => !removed.includes(id) && accepted.scene.layers.some((layer) => layer.id === id)));
      return announce({ ok: true }, 'removeLayers', targets, {});
    },

    /**
     * Copie chaque couche au-dessus de son original (la copie d'une couche d'identité est refusée : elle est unique). Un groupe se copie avec ses couches, en un bloc neuf au-dessus de lui ;
     * la copie d'une couche d'un groupe reste dans le groupe.
     * @param {string[]} ids
     * @returns {(Done & { ids: string[] }) | Refused}
     */
    duplicateLayers(ids) {
      const targets = selectionRoots(scene.layers, known(ids));
      if (targets.length === 0) return refuse('unknown', 'aucune couche à dupliquer');
      if (targets.some((id) => isIdentityKind(/** @type {Layer} */ (find(id)).kind))) return refuse('unique', 'une couche d’identité ne se duplique pas');
      const copiedGroups = targets.filter((id) => isGroup(/** @type {Layer} */ (find(id))));
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
      const accepted = accept({ ...scene, layers });
      if (!accepted.ok) return accepted;
      commit(targets.length === 1 ? 'Dupliquer une couche' : `Dupliquer ${targets.length} couches`, accepted.scene, copies);
      return announce({ ok: true, ids: copies }, 'duplicateLayers', targets, {});
    },

    /**
     * Déplace des couches, sans jamais franchir la frontière entre effets et couches d'identité. Un groupe se déplace d'un bloc avec ses couches ; les couches d'un même groupe se réordonnent
     * dans le groupe ; une sélection répartie entre le haut de la scène et un groupe, ou entre plusieurs groupes, est refusée.
     * @param {string[]} ids
     * @param {'up' | 'down' | 'top' | 'bottom' | { to: number }} where `up` / `down` : chaque couche d'un cran ; `top` / `bottom` / `to` : le bloc se regroupe, `to` étant sa position parmi les couches qui restent, dans sa famille (effets ou identités) ou dans son groupe
     * @returns {Done | Refused}
     */
    moveLayers(ids, where) {
      const targets = selectionRoots(scene.layers, known(ids));
      if (targets.length === 0) return refuse('unknown', 'aucune couche à déplacer');
      const owners = new Set(targets.map((id) => /** @type {Layer} */ (find(id)).group));
      if (owners.size > 1) return refuse('invalid', 'la sélection est répartie entre plusieurs groupes ou à la fois dans un groupe et hors de tout groupe');
      const [owner] = owners;
      /** @type {Layer[]} */
      let layers;
      if (owner === undefined) {
        const identity = isIdentityKind(/** @type {Layer} */ (find(targets[0])).kind);
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
      if (layers.every((layer, index) => layer === scene.layers[index])) return { ok: true };
      const accepted = accept({ ...scene, layers });
      if (!accepted.ok) return accepted;
      commit('Réordonner', accepted.scene);
      return announce({ ok: true }, 'moveLayers', targets, { where });
    },

    /**
     * Drops layers next to another layer, or into a group (a drag in the layers panel). A group moves with its members ; layers dropped next to a member join its group,
     * dropped next to a group or a free layer they leave theirs ; a group left empty is dissolved.
     * @param {string[]} ids
     * @param {import('../layer-group.js').DropTarget} target
     * @returns {Done | Refused}
     */
    moveLayersTo(ids, target) {
      const targets = known(ids);
      if (targets.length === 0) return refuse('unknown', 'aucune couche à déplacer');
      const layers = relocateLayers(scene.layers, targets, target);
      if (layers === null) return refuse('invalid', 'les couches ne se rangent pas à cet endroit');
      return announce(finish(layers, 'Réordonner', undefined), 'moveLayersTo', targets, { target });
    },

    /**
     * Règle `name`, `visible`, `locked`, `opacity` ou le rendu étendu (`blend`, `rotation`, `crop`, `blur`) sur des couches.
     * @param {string[]} ids
     * @param {{ name?: string, visible?: boolean, locked?: boolean, opacity?: number, blend?: import('../scene-doc.js').BlendMode, rotation?: number, crop?: Partial<import('../scene-doc.js').Crop>, blur?: number, bindings?: import('../layer-bindings.js').Binding[], timeline?: import('../layer-timeline.js').Track[], animation?: import('../layer-animation.js').Animation, filters?: import('../layer-filters.js').Filters, mask?: import('../layer-mask.js').Mask }} patch
     * @param {CoalesceOptions} [options]
     * @returns {Done | Refused}
     */
    setLayers(ids, patch, { coalesceKey } = {}) {
      const targets = known(ids);
      if (targets.length === 0) return refuse('unknown', 'aucune couche');
      const keys = Object.keys(patch);
      if (keys.length === 0 || keys.some((key) => !LAYER_PATCH_KEYS.includes(key))) return refuse('invalid', 'propriété de couche inconnue');
      const layers = scene.layers.map((layer) => {
        if (!targets.includes(layer.id)) return layer;
        const next = /** @type {Layer} */ ({ ...layer, ...patch });
        if (patch.name !== undefined && patch.name.trim() === '') delete next.name;
        else if (patch.name !== undefined) next.name = patch.name.trim();
        if (patch.locked === false) delete next.locked;
        if (patch.crop !== undefined) next.crop = /** @type {import('../scene-doc.js').Crop} */ ({ top: 0, right: 0, bottom: 0, left: 0, ...layer.crop, ...patch.crop });
        return next;
      });
      return announce(finish(layers, describePatch(keys, targets.length), coalesceKey), 'setLayers', targets, { patch });
    },

    /**
     * Fusionne un morceau de placement (fractions du canvas) dans chaque couche ciblée.
     * @param {string[]} ids
     * @param {Partial<Placement>} patch
     * @param {CoalesceOptions} [options]
     * @returns {Done | Refused}
     */
    setPlacement(ids, patch, { coalesceKey } = {}) {
      const targets = known(ids);
      if (targets.length === 0) return refuse('unknown', 'aucune couche');
      if (Object.keys(patch).some((key) => !PLACEMENT_KEYS.includes(key))) return refuse('invalid', 'clé de placement inconnue');
      const layers = placeLayers(scene.layers, Object.fromEntries(targets.map((id) => [id, patch])));
      if (layers === null) return refuse('invalid', 'une boîte de groupe a besoin d’une largeur et d’une hauteur');
      return announce(finish(layers, 'Placer', coalesceKey), 'setPlacement', targets, { patch });
    },

    /**
     * Un placement différent par couche en une seule entrée d'historique (alignement, répartition, glissement d'une
     * sélection multiple). Placer un groupe déplace et redimensionne ses couches.
     * @param {Record<string, Partial<Placement>>} patches
     * @param {CoalesceOptions & { label?: string }} [options]
     * @returns {Done | Refused}
     */
    setPlacements(patches, { coalesceKey, label: entryLabel = 'Placer' } = {}) {
      const targets = known(Object.keys(patches));
      if (targets.length === 0) return refuse('unknown', 'aucune couche');
      const before = Object.fromEntries(targets.map((id) => [id, { ...(/** @type {Layer} */ (find(id)).placement) }]));
      const layers = placeLayers(scene.layers, patches);
      if (layers === null) return refuse('invalid', 'une boîte de groupe a besoin d’une largeur et d’une hauteur');
      return announce(finish(layers, entryLabel, coalesceKey), 'setPlacements', targets, { patches }, before);
    },

    /**
     * Insère des couches venues d'ailleurs (un collage) : identifiants neufs, juste au-dessus de la sélection, sélectionnées
     * ensuite. Tout ou rien : si la limite de couches serait dépassée ou si le branding existe déjà, rien n'est inséré.
     * @param {Layer[]} incoming
     * @param {string} [entryLabel] le nom de l'entrée d'historique (par défaut « Coller … »)
     * @returns {(Done & { ids: string[] }) | Refused}
     */
    insertLayers(incoming, entryLabel) {
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
      const point = insertionPoint(layers, false);
      // Free layers pasted above a layer of a group join that group ; a pasted group goes above the whole block it was pasted over.
      const hasGroup = effects.some(isGroup);
      const index = point.group !== undefined && hasGroup ? /** @type {{ end: number }} */ (blockRange(layers, point.group)).end + 1 : point.index;
      const joining = point.group !== undefined && !hasGroup ? point.group : undefined;
      layers.splice(index, 0, ...effects.map((layer) => (joining !== undefined && layer.group === undefined ? { ...layer, group: joining } : layer)));
      layers.push(...identities);
      const accepted = accept({ ...scene, layers });
      if (!accepted.ok) return accepted;
      const ids = pasted.map(({ id }) => id);
      commit(entryLabel ?? (pasted.length === 1 ? 'Coller une couche' : `Coller ${pasted.length} couches`), accepted.scene, ids);
      return { ok: true, ids };
    },

    /**
     * Applique un style à des couches : l'opacité et le rendu étendu à toutes, les réglages d'effet à celles du même type que le style. Une
     * seule entrée d'historique.
     * @param {string[]} ids
     * @param {{ kind: string, opacity: number, options: Record<string, unknown>, look?: Partial<Pick<Layer, 'blend' | 'rotation' | 'crop' | 'blur' | 'bindings' | 'timeline' | 'animation' | 'filters' | 'mask'>> }} style
     * @returns {Done | Refused}
     */
    applyStyle(ids, style) {
      const targets = known(ids);
      if (targets.length === 0) return refuse('unknown', 'aucune couche');
      const layers = scene.layers.map((layer) => {
        if (!targets.includes(layer.id)) return layer;
        return { ...withoutLook(layer), ...structuredClone(style.look ?? {}), opacity: style.opacity, ...(layer.kind === style.kind ? { options: structuredClone(style.options) } : {}) };
      });
      return finish(layers, targets.length === 1 ? 'Coller le style' : `Coller le style sur ${targets.length} couches`, undefined);
    },

    /**
     * Remplace les couches et la transition d'arrivée par celles d'une version gardée (`dev/version-store.js`), en une seule entrée
     * d'historique annulable. L'identité, le nom et les étiquettes de la scène restent les siens ; la sélection est vidée (les
     * identifiants des couches restaurées ne sont pas ceux d'avant).
     * @param {SceneDoc} version la scène gardée
     * @param {string} [entryLabel]
     * @returns {Done | Refused}
     */
    restoreVersion(version, entryLabel) {
      const { layers, transition } = structuredClone(version);
      const { transition: _previous, ...rest } = scene;
      const accepted = accept({ ...rest, layers, ...(transition === undefined ? {} : { transition }) });
      if (!accepted.ok) return accepted;
      if (stableStringify(accepted.scene) === stableStringify(scene)) return { ok: true };
      commit(entryLabel ?? 'Restaurer une version', accepted.scene, []);
      return announce({ ok: true }, 'restoreVersion', [], {});
    },

    /**
     * Groups layers: they gather in a new group, which goes above the top-most of them and is selected.
     * @param {string[]} ids
     * @returns {(Done & { id: string }) | Refused}
     */
    groupLayers(ids) {
      const targets = known(ids);
      if (targets.length === 0) return refuse('unknown', 'aucune couche à grouper');
      if (scene.layers.filter(isGroup).length >= MAX_GROUPS) return refuse('limit', `${MAX_GROUPS} groupes au plus`);
      const id = uniqueLayerId(scene, 'group');
      const layers = groupLayers(scene.layers, targets, { id });
      if (layers === null) return refuse('invalid', 'seules des couches se groupent : ni un groupe, ni une couche d’identité');
      const accepted = accept({ ...scene, layers });
      if (!accepted.ok) return accepted;
      commit(targets.length === 1 ? 'Grouper une couche' : `Grouper ${targets.length} couches`, accepted.scene, [id]);
      return announce({ ok: true, id }, 'groupLayers', targets, {});
    },

    /**
     * Takes groups apart: the groups among `ids`, and those of the layers among them. The members stay where they are and are selected ; the group's own look is lost with it.
     * @param {string[]} ids
     * @returns {(Done & { ids: string[] }) | Refused}
     */
    ungroupLayers(ids) {
      const groups = [...new Set(known(ids).flatMap((id) => {
        const layer = /** @type {Layer} */ (find(id));
        return isGroup(layer) ? [layer.id] : layer.group === undefined ? [] : [layer.group];
      }))];
      if (groups.length === 0) return refuse('invalid', 'aucun groupe à dégrouper');
      const freed = groups.flatMap((id) => membersOf(scene.layers, id).map((member) => member.id));
      let layers = scene.layers;
      for (const id of groups) layers = /** @type {Layer[]} */ (ungroupLayers(layers, id));
      const accepted = accept({ ...scene, layers });
      if (!accepted.ok) return accepted;
      commit(groups.length === 1 ? 'Dégrouper' : `Dégrouper ${groups.length} groupes`, accepted.scene, freed);
      return announce({ ok: true, ids: freed }, 'ungroupLayers', groups, {});
    },

    /**
     * Remet des couches plein cadre, opaques et sans rendu étendu (visibilité, verrou, nom et réglages d'effet restent), en une entrée.
     * @param {string[]} ids
     * @returns {Done | Refused}
     */
    resetLayers(ids) {
      const targets = known(ids);
      if (targets.length === 0) return refuse('unknown', 'aucune couche');
      const layers = scene.layers.map((layer) => {
        if (!targets.includes(layer.id)) return layer;
        return { ...withoutLook(layer), opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 } };
      });
      return announce(finish(layers, targets.length === 1 ? 'Réinitialiser la couche' : `Réinitialiser ${targets.length} couches`, undefined), 'resetLayers', targets, {});
    },

    /**
     * Fusionne des options dans l'effet d'une couche.
     * @param {string} id
     * @param {Record<string, unknown>} patch
     * @param {CoalesceOptions} [options]
     * @returns {Done | Refused}
     */
    setOptions(id, patch, { coalesceKey } = {}) {
      if (find(id) === undefined) return refuse('unknown', `couche introuvable : ${id}`);
      const layers = scene.layers.map((layer) => (layer.id === id ? { ...layer, options: { ...layer.options, ...patch } } : layer));
      return announce(finish(layers, 'Régler l’effet', coalesceKey), 'setOptions', [id], { patch });
    },

    /**
     * Change l'effet d'une couche : nouveau type, options de départ du nouveau type. Le placement, l'opacité, la
     * visibilité, le verrou et la place dans la pile restent ceux de la couche.
     * @param {string} id
     * @param {string} kind
     * @param {Record<string, unknown>} [options]
     * @returns {Done | Refused}
     */
    setLayerKind(id, kind, options = {}) {
      const layer = find(id);
      if (layer === undefined) return refuse('unknown', `couche introuvable : ${id}`);
      const resolved = resolveKindId(kind);
      if (resolved === null) return refuse('invalid', `type de couche inconnu : ${kind}`);
      if (kindFamily(resolved) !== kindFamily(layer.kind)) return refuse('invalid', 'un effet, un contenu et une couche d’identité ne se remplacent pas entre eux');
      if (isIdentityKind(resolved) && scene.layers.some((other) => other.id !== id && other.kind === resolved)) {
        return refuse('unique', 'cette couche existe déjà dans la scène');
      }
      if (resolved === layer.kind) return { ok: true };
      if (!animationFits(layer.animation, kindCapabilities(resolved).content)) return refuse('invalid', 'cette couche a une entrée ou une sortie propre à son contenu (texte ou forme) : choisissez-en une autre avant de changer son type');
      const layers = scene.layers.map((candidate) => (candidate.id === id ? { ...candidate, kind: resolved, options } : candidate));
      return announce(finish(layers, 'Changer l’effet', undefined), 'setLayerKind', [id], { kind: resolved, options });
    },

    /**
     * Propriétés de la scène elle-même (nom, étiquettes, transition d'arrivée, timeline). `undefined` retire la propriété.
     * @param {{ name?: string, tags?: string[] | undefined, transition?: SceneDoc['transition'] | undefined, timeline?: SceneDoc['timeline'] | undefined }} patch
     * @param {CoalesceOptions} [options]
     * @returns {Done | Refused}
     */
    setSceneProps(patch, { coalesceKey } = {}) {
      const next = { ...scene, ...patch };
      for (const key of /** @type {const} */ (['tags', 'transition', 'timeline'])) if (key in patch && patch[key] === undefined) delete next[key];
      const accepted = accept(next);
      if (!accepted.ok) return accepted;
      if (stableStringify(accepted.scene) === stableStringify(scene)) return { ok: true };
      commit('Régler la scène', accepted.scene, selection, coalesceKey);
      return announce({ ok: true }, 'setSceneProps', [], { patch });
    },

    /**
     * Exécute plusieurs commandes comme une seule : une entrée d'historique (annulable d'un coup), une notification. Si rien
     * n'a changé, rien n'est empilé. Les annulations demandées pendant le lot sont refusées.
     * @template T
     * @param {string} entryLabel
     * @param {() => T} run
     * @returns {T}
     */
    batch(entryLabel, run) {
      if (batch !== null) return run();
      batch = { before: null };
      try {
        return run();
      } finally {
        const finished = batch;
        batch = null;
        if (finished.before !== null) {
          past.push({ scene: finished.before.scene, selection: finished.before.selection, label: entryLabel, at: now() });
          if (past.length > historyLimit) past = past.slice(past.length - historyLimit);
          label = entryLabel;
          labelAt = now();
          lastCoalesce = null;
          notify();
        }
      }
    },

    /** @returns {Done | Refused} */
    undo() {
      if (batch !== null) return refuse('invalid', 'annuler est impossible pendant un lot de commandes');
      if (!stepBack()) return refuse('empty', 'rien à annuler');
      notify();
      return { ok: true };
    },

    /** @returns {Done | Refused} */
    redo() {
      if (batch !== null) return refuse('invalid', 'rétablir est impossible pendant un lot de commandes');
      if (!stepForward()) return refuse('empty', 'rien à rétablir');
      notify();
      return { ok: true };
    },

    /**
     * Toutes les entrées de l'historique, de la plus ancienne à la plus récente, avec l'état avant et après chacune ;
     * `position` est le nombre d'entrées appliquées (les suivantes sont des entrées défaites, rétablissables).
     * @returns {{ entries: { label: string, at: number, before: SceneDoc, after: SceneDoc }[], position: number }}
     */
    history() {
      const undone = [...future].reverse();
      const states = [...past.map((snapshot) => snapshot.scene), scene, ...undone.map((snapshot) => snapshot.scene)];
      const entries = [...past, ...undone].map((snapshot, index) => ({ label: snapshot.label, at: snapshot.at, before: states[index], after: states[index + 1] }));
      return { entries, position: past.length };
    },

    /**
     * Revient (ou avance) à l'état après `position` entrées, en une seule notification. Rien n'est perdu : les entrées
     * dépassées restent rétablissables jusqu'à la prochaine modification.
     * @param {number} position 0 = l'état de départ
     * @returns {Done | Refused}
     */
    goTo(position) {
      if (batch !== null) return refuse('invalid', 'l’historique est inaccessible pendant un lot de commandes');
      const target = Math.max(0, Math.min(past.length + future.length, Math.trunc(position)));
      if (target === past.length) return { ok: true };
      while (past.length > target && stepBack());
      while (past.length < target && stepForward());
      notify();
      return { ok: true };
    },
  };

  /** Annule une entrée, sans notifier. @returns {boolean} */
  function stepBack() {
    const previous = past.pop();
    if (previous === undefined) return false;
    future.push({ scene, selection, label, at: labelAt });
    scene = previous.scene;
    selection = known(previous.selection);
    label = past.length === 0 ? '' : past[past.length - 1].label;
    labelAt = past.length === 0 ? 0 : past[past.length - 1].at;
    lastCoalesce = null;
    if (solo !== null && find(solo) === undefined) solo = null;
    return true;
  }

  /** Rétablit une entrée, sans notifier. @returns {boolean} */
  function stepForward() {
    const next = future.pop();
    if (next === undefined) return false;
    past.push({ scene, selection, label: next.label, at: next.at });
    scene = next.scene;
    selection = known(next.selection);
    label = next.label;
    labelAt = next.at;
    lastCoalesce = null;
    return true;
  }

  /**
   * @param {Layer[]} layers
   * @param {string} entryLabel
   * @param {string | undefined} coalesceKey
   * @returns {Done | Refused}
   */
  function finish(layers, entryLabel, coalesceKey) {
    const accepted = accept({ ...scene, layers });
    if (!accepted.ok) return accepted;
    if (stableStringify(accepted.scene) === stableStringify(scene)) return { ok: true };
    commit(entryLabel, accepted.scene, selection, coalesceKey);
    return { ok: true };
  }
}

/** @param {string[]} keys @param {number} count */
function describePatch(keys, count) {
  const subject = count === 1 ? 'la couche' : `${count} couches`;
  if (keys.length === 1 && keys[0] === 'visible') return `Afficher ou masquer ${subject}`;
  if (keys.length === 1 && keys[0] === 'locked') return `Verrouiller ou déverrouiller ${subject}`;
  if (keys.length === 1 && keys[0] === 'opacity') return `Opacité de ${subject}`;
  if (keys.length === 1 && keys[0] === 'blend') return `Fusion de ${subject}`;
  if (keys.length === 1 && keys[0] === 'rotation') return `Rotation de ${subject}`;
  if (keys.length === 1 && keys[0] === 'crop') return `Rognage de ${subject}`;
  if (keys.length === 1 && keys[0] === 'blur') return `Flou de ${subject}`;
  if (keys.length === 1 && keys[0] === 'bindings') return `Liaisons de ${subject}`;
  if (keys.length === 1 && keys[0] === 'timeline') return `Animation de ${subject}`;
  if (keys.length === 1 && keys[0] === 'animation') return `Entrée, boucle et sortie de ${subject}`;
  if (keys.length === 1 && keys[0] === 'filters') return `Filtres de ${subject}`;
  if (keys.length === 1 && keys[0] === 'mask') return `Masque de ${subject}`;
  if (keys.length === 1 && keys[0] === 'name') return 'Renommer une couche';
  return `Régler ${subject}`;
}
