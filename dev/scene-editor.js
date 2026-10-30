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
 */
import { MAX_LAYERS, canonicalSceneDoc, createLayer, validateSceneDoc } from '../scene-doc.js';
import { isIdentityKind, resolveKindId } from '../layer-kinds.js';

const DEFAULT_HISTORY_LIMIT = 200;
const DEFAULT_COALESCE_MS = 800;
const PLACEMENT_KEYS = ['x', 'y', 'width', 'height'];
const LAYER_PATCH_KEYS = ['name', 'visible', 'locked', 'opacity'];

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
  if (solo === null || !scene.layers.some(({ id }) => id === solo)) return scene;
  return { ...scene, layers: scene.layers.map((layer) => (layer.id === solo ? layer : { ...layer, visible: false })) };
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
  /** @typedef {{ scene: SceneDoc, selection: string[], label: string }} Snapshot */
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
  let baseline = stableStringify(initial);
  /** @type {Set<(state: EditorState) => void>} */
  const listeners = new Set();
  /** @type {EditorState | null} */
  let cached = null;

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
    const at = now();
    const merges = coalesceKey !== undefined && lastCoalesce !== null && lastCoalesce.key === coalesceKey
      && at - lastCoalesce.at <= coalesceMs && past.length > 0;
    if (!merges) {
      past.push({ scene, selection, label: entryLabel });
      if (past.length > historyLimit) past = past.slice(past.length - historyLimit);
    }
    scene = next;
    selection = nextSelection;
    label = merges ? label : entryLabel;
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
   * Position d'insertion d'une nouvelle couche : juste au-dessus de la sélection, sinon au sommet des effets ; un
   * effet reste sous les couches d'identité, une couche d'identité au-dessus des effets.
   * @param {Layer[]} layers
   * @param {boolean} identity
   */
  function insertionIndex(layers, identity) {
    const effects = layers.filter(({ kind }) => !isIdentityKind(kind)).length;
    if (identity) return layers.length;
    const anchor = selection.length === 0 ? -1 : Math.max(...selection.map((id) => layers.findIndex((layer) => layer.id === id)));
    return anchor < 0 || anchor >= effects ? effects : anchor + 1;
  }

  return {
    state,

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
      if (scene.layers.length >= MAX_LAYERS) return refuse('limit', `${MAX_LAYERS} couches au plus`);
      if (isIdentityKind(resolved) && scene.layers.some((layer) => layer.kind === resolved)) {
        return refuse('unique', 'cette couche existe déjà dans la scène');
      }
      const id = uniqueLayerId(scene, resolved);
      const layer = createLayer({
        id,
        kind: resolved,
        ...(name === undefined ? {} : { name }),
        ...(options === undefined ? {} : { options }),
        ...(opacity === undefined ? {} : { opacity }),
        ...(placement === undefined ? {} : { placement: { x: 0, y: 0, width: 1, height: 1, ...placement } }),
      });
      const layers = [...scene.layers];
      layers.splice(insertionIndex(layers, isIdentityKind(resolved)), 0, layer);
      const accepted = accept({ ...scene, layers });
      if (!accepted.ok) return accepted;
      commit('Ajouter une couche', accepted.scene, [id]);
      return { ok: true, id };
    },

    /**
     * @param {string[]} ids
     * @returns {Done | Refused}
     */
    removeLayers(ids) {
      const targets = known(ids);
      if (targets.length === 0) return refuse('unknown', 'aucune couche à supprimer');
      const accepted = accept({ ...scene, layers: scene.layers.filter(({ id }) => !targets.includes(id)) });
      if (!accepted.ok) return accepted;
      commit(targets.length === 1 ? 'Supprimer une couche' : `Supprimer ${targets.length} couches`, accepted.scene, selection.filter((id) => !targets.includes(id)));
      return { ok: true };
    },

    /**
     * Copie chaque couche au-dessus de son original (la copie d'une couche d'identité est refusée : elle est unique).
     * @param {string[]} ids
     * @returns {(Done & { ids: string[] }) | Refused}
     */
    duplicateLayers(ids) {
      const targets = known(ids);
      if (targets.length === 0) return refuse('unknown', 'aucune couche à dupliquer');
      if (targets.some((id) => isIdentityKind(/** @type {Layer} */ (find(id)).kind))) return refuse('unique', 'une couche d’identité ne se duplique pas');
      if (scene.layers.length + targets.length > MAX_LAYERS) return refuse('limit', `${MAX_LAYERS} couches au plus`);
      /** @type {Layer[]} */
      const layers = [];
      /** @type {string[]} */
      const copies = [];
      for (const layer of scene.layers) {
        layers.push(layer);
        if (!targets.includes(layer.id)) continue;
        const { locked: _locked, ...unlocked } = structuredClone(layer);
        const id = uniqueLayerId({ ...scene, layers }, layer.id.replace(/-\d+$/, ''));
        copies.push(id);
        layers.push({ ...unlocked, id, ...(layer.name === undefined ? {} : { name: `${layer.name} copie` }) });
      }
      const accepted = accept({ ...scene, layers });
      if (!accepted.ok) return accepted;
      commit(targets.length === 1 ? 'Dupliquer une couche' : `Dupliquer ${targets.length} couches`, accepted.scene, copies);
      return { ok: true, ids: copies };
    },

    /**
     * Déplace des couches, sans jamais franchir la frontière entre effets et couches d'identité.
     * @param {string[]} ids
     * @param {'up' | 'down' | 'top' | 'bottom' | { to: number }} where `up` / `down` : chaque couche d'un cran ; `top` / `bottom` / `to` : le bloc se regroupe, `to` étant sa position parmi les couches qui restent, dans sa famille (effets ou identités)
     * @returns {Done | Refused}
     */
    moveLayers(ids, where) {
      const targets = known(ids);
      if (targets.length === 0) return refuse('unknown', 'aucune couche à déplacer');
      const group = scene.layers.filter((layer) => isIdentityKind(layer.kind) === isIdentityKind(/** @type {Layer} */ (find(targets[0])).kind));
      if (targets.some((id) => !group.some((layer) => layer.id === id))) return refuse('invalid', 'effets et couches d’identité ne se mélangent pas');
      /** @type {Layer[]} */
      let reordered;
      if (where === 'up' || where === 'down') {
        // Chaque couche ciblée change de place avec sa voisine non ciblée, comme dans un éditeur graphique.
        reordered = [...group];
        const order = where === 'up' ? reordered.map((_, index) => reordered.length - 1 - index) : reordered.map((_, index) => index);
        const step = where === 'up' ? 1 : -1;
        for (const index of order) {
          const neighbour = reordered[index + step];
          if (!targets.includes(reordered[index].id) || neighbour === undefined || targets.includes(neighbour.id)) continue;
          [reordered[index], reordered[index + step]] = [neighbour, reordered[index]];
        }
      } else {
        const moving = group.filter(({ id }) => targets.includes(id));
        const staying = group.filter(({ id }) => !targets.includes(id));
        const at = where === 'top' ? staying.length : where === 'bottom' ? 0 : Math.max(0, Math.min(staying.length, where.to));
        reordered = [...staying.slice(0, at), ...moving, ...staying.slice(at)];
      }
      const others = scene.layers.filter((layer) => !group.includes(layer));
      const identity = isIdentityKind(group[0].kind);
      const layers = identity ? [...others, ...reordered] : [...reordered, ...others];
      if (layers.every((layer, index) => layer === scene.layers[index])) return { ok: true };
      const accepted = accept({ ...scene, layers });
      if (!accepted.ok) return accepted;
      commit('Réordonner', accepted.scene);
      return { ok: true };
    },

    /**
     * Règle `name`, `visible`, `locked` ou `opacity` sur des couches.
     * @param {string[]} ids
     * @param {{ name?: string, visible?: boolean, locked?: boolean, opacity?: number }} patch
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
        const next = { ...layer, ...patch };
        if (patch.name !== undefined && patch.name.trim() === '') delete next.name;
        else if (patch.name !== undefined) next.name = patch.name.trim();
        if (patch.locked === false) delete next.locked;
        return next;
      });
      return finish(layers, describePatch(keys, targets.length), coalesceKey);
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
      const layers = scene.layers.map((layer) => (targets.includes(layer.id) ? { ...layer, placement: { ...layer.placement, ...patch } } : layer));
      return finish(layers, 'Placer', coalesceKey);
    },

    /**
     * Un placement différent par couche en une seule entrée d'historique (alignement, répartition, glissement d'une
     * sélection multiple).
     * @param {Record<string, Partial<Placement>>} patches
     * @param {CoalesceOptions & { label?: string }} [options]
     * @returns {Done | Refused}
     */
    setPlacements(patches, { coalesceKey, label: entryLabel = 'Placer' } = {}) {
      const targets = known(Object.keys(patches));
      if (targets.length === 0) return refuse('unknown', 'aucune couche');
      const layers = scene.layers.map((layer) => (targets.includes(layer.id) ? { ...layer, placement: { ...layer.placement, ...patches[layer.id] } } : layer));
      return finish(layers, entryLabel, coalesceKey);
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
      return finish(layers, 'Régler l’effet', coalesceKey);
    },

    /**
     * Propriétés de la scène elle-même (nom, étiquettes, transition d'arrivée). `undefined` retire la propriété.
     * @param {{ name?: string, tags?: string[] | undefined, transition?: SceneDoc['transition'] | undefined }} patch
     * @param {CoalesceOptions} [options]
     * @returns {Done | Refused}
     */
    setSceneProps(patch, { coalesceKey } = {}) {
      const next = { ...scene, ...patch };
      for (const key of /** @type {const} */ (['tags', 'transition'])) if (key in patch && patch[key] === undefined) delete next[key];
      const accepted = accept(next);
      if (!accepted.ok) return accepted;
      if (stableStringify(accepted.scene) === stableStringify(scene)) return { ok: true };
      commit('Régler la scène', accepted.scene, selection, coalesceKey);
      return { ok: true };
    },

    /** @returns {Done | Refused} */
    undo() {
      const previous = past.pop();
      if (previous === undefined) return refuse('empty', 'rien à annuler');
      future.push({ scene, selection, label });
      scene = previous.scene;
      selection = known(previous.selection);
      label = past.length === 0 ? '' : past[past.length - 1].label;
      lastCoalesce = null;
      if (solo !== null && find(solo) === undefined) solo = null;
      notify();
      return { ok: true };
    },

    /** @returns {Done | Refused} */
    redo() {
      const next = future.pop();
      if (next === undefined) return refuse('empty', 'rien à rétablir');
      past.push({ scene, selection, label: next.label });
      scene = next.scene;
      selection = known(next.selection);
      label = next.label;
      lastCoalesce = null;
      notify();
      return { ok: true };
    },
  };

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
  if (keys.length === 1 && keys[0] === 'name') return 'Renommer une couche';
  return `Régler ${subject}`;
}
