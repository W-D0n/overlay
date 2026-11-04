// @ts-check
import { COMPONENT_REGISTRY } from './component-registry.js';
import { cssEasing, normalizeTransition, transitionStyles } from './background-transition.js';
import { isAudioOn, isGroupKind, isIdentityKind, kindCapabilities } from './layer-kinds.js';
import { referenceScale } from './render-reference.js';
import { leaveDelayMs, restartsAnimationOn } from './layer-animation.js';
import { boundingBox } from './layer-group.js';
import { lookAt, lookStyles, paramValues, percent, valuesAt } from './layer-look.js';
import { recordPulse, usesAudio } from './layer-bindings.js';
import { effectiveTimeline, hasKeys, playbackTime, restartsOn } from './layer-timeline.js';
import { getRenderClock } from './render-clock.js';

/**
 * scene-runtime.js — Monte une scène (une pile de couches, `scene-doc.js`) dans un conteneur.
 *
 * Réconcilie la scène reçue avec ce qui est déjà monté, couche par couche et par identifiant :
 *   - même `id`, même `kind` → `update(options)`, jamais de recréation (l'effet garde son état) ;
 *   - même `id`, `kind` différent → l'effet est remplacé sur place, les autres couches ne bougent pas ;
 *   - `id` nouveau → montage ; `id` disparu → démontage ;
 *   - ordre → `z-index`, sans déplacer aucun nœud (déplacer un nœud redémarrerait ses animations CSS) ;
 *   - `opacity`, `placement`, et le rendu étendu (`blend`, `rotation`, `crop`, `blur`) → appliqués sur le calque de la couche,
 *     sans toucher à l'effet ;
 *   - `visible: false` → la couche n'est **pas montée** (son effet ne dessine rien, ne coûte ni CPU ni GPU) ; la remontrer remonte
 *     son effet, qui repart de zéro.
 *
 * Chaque couche vit dans son propre calque absolu ; `placement` est en fractions de la scène, donc la scène
 * épouse la source OBS quelle que soit sa résolution. Un effet dessine sa composition de référence dans son
 * calque : un calque plus petit que la scène en montre une version réduite.
 *
 * Une scène porteuse d'une `transition` est une **arrivée** : elle est montée dans un nouveau calque de scène,
 * superposé à l'ancien pendant l'animation (docs/specs/background-preset-transitions.md), puis l'ancien est
 * retiré. Sans `transition`, c'est un réglage : la réconciliation se fait en place, en direct. Une scène sans
 * couche est un fond absent.
 *
 * Une couche qui échoue (type inconnu, fabrique ou `update` qui lève) est signalée par `onLayerError` sans
 * arrêter les autres ; son montage est retenté à la scène suivante. Un état qu'aucune couche ne peut afficher
 * (type inconnu sur un fond d'une seule couche, par exemple un état plus récent que le code chargé par OBS)
 * laisse la scène en place plutôt que de vider l'écran en direct.
 *
 * Un **groupe** (`layer-group.js`) est une couche dont le calque contient ceux de ses couches : son opacité, sa fusion, son flou, ses filtres, sa transformation et ses animations
 * s'appliquent à l'ensemble composé. Son calque est plein cadre (les couches gardent leurs placements en fractions de la scène) et tourne ou s'agrandit autour du centre de sa boîte.
 * Un groupe masqué masque ses couches ; une couche qui change de groupe change de calque parent (une page de code isolée se recharge alors).
 *
 * Les couches d'**identité** (le branding, `layer-kinds.js`) ne sont pas des effets de fond : elles vivent dans un calque à
 * part, au-dessus des scènes, réconcilié en place à chaque scène et jamais animé par une arrivée. Sans cela, le branding
 * s'estomperait et se refondrait à chaque changement de scène alors qu'il doit rester fixe.
 *
 * Routage selon les capacités déclarées par `layer-kinds.js` : l'audio alimente chaque couche visible qui le
 * déclare et dont le réglage `audioReactive` est actif ; une réaction est traitée par les couches visibles qui
 * la gèrent nativement, sinon l'appelant la fait dessiner **une seule fois** par la surcouche partagée.
 *
 * @typedef {import('./scene-doc.js').SceneDoc} SceneDoc
 * @typedef {import('./scene-doc.js').Layer} Layer
 * @typedef {{ id: string, kind: string, instance: import('./types.js').ComponentInstance, visible: boolean }} MountedLayerInfo
 * @typedef {{ id: string, kind: string, instance: import('./types.js').ComponentInstance, calque: *, visible: boolean, options: Record<string, unknown>, layer: Layer, memory: number[], appliedKey: string, parent: string | null, age: number, leftAt: number | null, frozen: Partial<Record<import('./layer-bindings.js').BindingTarget, number>> | null }} MountedLayer
 * L'`age` est l'horloge propre de la couche, en millisecondes : 0 au montage et à une alerte de relance (`layer-animation.js`). `leftAt` : l'âge où sa scène a été
 * remplacée (la couche joue alors sa sortie « au départ »), `frozen` : ses valeurs de base figées à ce moment, la timeline de la scène ayant repris au début pour la suivante.
 * @typedef {{ calque: *, layers: Map<string, MountedLayer> }} Stage
 */

/**
 * @param {HTMLElement} container
 * @param {{
 *   registry?: Record<string, (options: any) => import('./types.js').ComponentInstance>,
 *   createCalque?: () => *,
 *   createStageCalque?: () => *,
 *   capabilitiesOf?: (kind: string) => import('./layer-kinds.js').LayerCapabilities,
 *   identityOf?: (kind: string) => boolean,
 *   onLayerError?: (failure: { layerId: string, error: unknown }) => void,
 *   onMountChange?: () => void,
 *   scheduleFrame?: (callback: () => void) => void,
 *   scheduleTimeout?: (callback: () => void, delayMs: number) => void,
 *   clock?: Pick<ReturnType<typeof import('./render-clock.js').createRenderClock>, 'subscribe'>,
 * }} [deps] points d'injection pour les tests (aucun DOM requis).
 */
export function createSceneRuntime(container, deps = {}) {
  const registry = deps.registry ?? COMPONENT_REGISTRY;
  const createCalque = deps.createCalque ?? defaultCreateCalque;
  const createStageCalque = deps.createStageCalque ?? defaultCreateStageCalque;
  const capabilitiesOf = deps.capabilitiesOf ?? kindCapabilities;
  const identityOf = deps.identityOf ?? isIdentityKind;
  const onLayerError = deps.onLayerError ?? ((failure) => console.error(`[scene-runtime] couche « ${failure.layerId} » : `, failure.error));
  const onMountChange = deps.onMountChange ?? (() => {});
  const scheduleFrame = deps.scheduleFrame
    ?? ((callback) => globalThis.requestAnimationFrame?.(callback) ?? callback());
  const scheduleTimeout = deps.scheduleTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));

  /** Les liaisons des couches (`layer-bindings.js`) : leur horloge ne tourne que s'il en existe une à animer. */
  const clock = deps.clock ?? { subscribe: (/** @type {import('./render-clock.js').FrameListener} */ listener) => getRenderClock().subscribe(listener) };
  /** @type {(() => void) | null} */
  let stopClock = null;
  /** @type {import('./layer-bindings.js').Levels | null} */
  let levels = null;
  let levelsAt = -Infinity;
  let clockTime = 0;
  /** @type {Map<string, number>} */
  const pulses = new Map();
  /** La lecture de la timeline de la scène (`layer-timeline.js`) : le temps écoulé depuis l'arrivée de la scène, en millisecondes. */
  const playback = { elapsedMs: 0, playing: true };
  /** @type {Set<(state: ReturnType<typeof timelineState>) => void>} */
  const timelineListeners = new Set();

  /** @type {Stage | null} */
  let current = null;
  /** @type {Stage[]} */
  let outgoing = [];
  /** Calque des couches d'identité, au-dessus de toutes les scènes ; `null` tant qu'aucune n'est montée. @type {Stage | null} */
  let identity = null;
  /** @type {SceneDoc | null} */
  let latestScene = null;
  let paused = false;

  // La hauteur de la source change l'échelle des tailles en pixels de référence (le flou d'une couche).
  const sizeObserver = typeof globalThis.ResizeObserver === 'function' && typeof container.style?.setProperty === 'function'
    ? new globalThis.ResizeObserver(() => { container.style.setProperty('--reference-scale', String(referenceScale(container.clientHeight))); })
    : null;
  sizeObserver?.observe(container);

  /** @param {Stage} stage */
  function disposeStage(stage) {
    for (const entry of stage.layers.values()) disposeLayer(entry);
    stage.layers.clear();
    stage.calque.remove();
  }

  /** @param {MountedLayer} entry */
  function disposeLayer(entry) {
    try {
      entry.instance.destroy?.();
    } catch (error) {
      onLayerError({ layerId: entry.id, error });
    }
    entry.calque.remove();
  }

  function flushOutgoing() {
    for (const stage of outgoing) disposeStage(stage);
    outgoing = [];
  }

  function unmountEffects() {
    flushOutgoing();
    if (current !== null) disposeStage(current);
    current = null;
  }

  function unmountAll() {
    unmountEffects();
    if (identity !== null) disposeStage(identity);
    identity = null;
  }

  /**
   * Les couches d'identité de la scène, réconciliées en place : elles apparaissent, se règlent et disparaissent
   * tout de suite, sans suivre l'animation d'arrivée des effets.
   * @param {Layer[]} layers
   */
  function reconcileIdentity(layers) {
    if (layers.length === 0) {
      if (identity !== null) disposeStage(identity);
      identity = null;
      return;
    }
    if (identity === null) {
      identity = createStage();
      identity.calque.style.zIndex = '2';
    }
    reconcile(identity, { layers });
  }

  /** @returns {Stage} */
  function createStage() {
    const calque = createStageCalque();
    container.appendChild(calque);
    return { calque, layers: new Map() };
  }

  /**
   * Monte une couche dans une scène, dans le calque de son groupe si elle en a un. Lève si le type est inconnu ou si la fabrique échoue.
   * @param {Stage} stage @param {Layer} layer @param {*} host le calque qui reçoit celui de la couche : celui de la scène, ou le contenant de son groupe
   * @returns {MountedLayer}
   */
  function mountLayer(stage, layer, host) {
    const factory = Object.hasOwn(registry, layer.kind) ? registry[layer.kind] : undefined;
    if (factory === undefined) throw new Error(`type de couche inconnu : ${layer.kind}`);
    const instance = factory(layer.options, { sceneHeight: () => container.clientHeight });
    const calque = createCalque();
    calque.appendChild(instance.el);
    host.appendChild(calque);
    return { id: layer.id, kind: layer.kind, instance, calque, visible: layer.visible, options: layer.options, layer, memory: [], appliedKey: '', parent: layer.group ?? null, age: 0, leftAt: null, frozen: null };
  }

  /**
   * @param {MountedLayer} entry @param {Layer} layer @param {number} index
   * @param {import('./scene-doc.js').Placement} [box] for a group: the box of its members, the center its transformations turn around
   */
  function styleLayer(entry, layer, index, box = layer.placement) {
    // A group covers the whole frame (its members keep their placements in fractions of the scene) and turns around the center of its box.
    const grouped = isGroupKind(layer.kind);
    const { x, y, width, height } = grouped ? { x: 0, y: 0, width: 1, height: 1 } : layer.placement;
    entry.visible = layer.visible;
    entry.options = layer.options;
    // Des liaisons nouvelles repartent de zéro (le niveau lissé d'une ancienne liaison n'a plus de sens).
    if (entry.layer.bindings !== layer.bindings) entry.memory = [];
    // Une animation modifiée repart de zéro : celui qui la règle la voit jouer.
    if (JSON.stringify(entry.layer.animation) !== JSON.stringify(layer.animation)) entry.age = 0;
    entry.layer = layer;
    entry.appliedKey = '';
    const animated = bindingValues(entry, clockTime, 0);
    const look = animatedLook(entry, animated);
    driveParams(entry, animated);
    entry.instance.animate?.(look.content ?? null);
    Object.assign(entry.calque.style, {
      left: percent(x),
      top: percent(y),
      width: percent(width),
      height: percent(height),
      zIndex: String(index),
      ...(grouped ? { transformOrigin: `${percent(box.x + box.width / 2)} ${percent(box.y + box.height / 2)}` } : {}),
      ...lookStyles(layer, look),
    });
    syncClock();
  }

  /** Toutes les couches montées, effets et identité. @returns {MountedLayer[]} */
  function mountedEntries() {
    return [...(current === null ? [] : current.layers.values()), ...(identity === null ? [] : identity.layers.values())];
  }

  /** Les couches des scènes sortantes qui jouent leur sortie « au départ de la scène ». @returns {MountedLayer[]} */
  function leavingEntries() {
    return outgoing.flatMap((stage) => [...stage.layers.values()].filter((entry) => entry.leftAt !== null));
  }

  /** La timeline de la scène affichée : la sienne, ou celle par défaut. */
  function sceneTimeline() {
    return effectiveTimeline(latestScene?.timeline, latestScene?.layers ?? []);
  }

  /** @returns {{ playing: boolean, timeMs: number, durationMs: number, loop: 'once' | 'loop' }} */
  function timelineState() {
    const timeline = sceneTimeline();
    return { playing: playback.playing, timeMs: playbackTime(playback.elapsedMs, timeline), durationMs: timeline.durationMs, loop: timeline.loop };
  }

  /**
   * Les valeurs animées d'une couche à un instant : sa timeline, puis ses liaisons (qui l'emportent sur la même valeur).
   * @param {MountedLayer} entry @param {number} time @param {number} dt
   */
  function bindingValues(entry, time, dt) {
    return valuesAt(entry.layer, entry.memory, { timelineMs: playbackTime(playback.elapsedMs, sceneTimeline()), levels, levelsAt, pulses, time, dt });
  }

  /**
   * Les valeurs de base d'une couche avec son animation par-dessus, à l'instant de son horloge (voir `lookAt`).
   * @param {MountedLayer} entry @param {import('./layer-look.js').BoundValues} bound
   */
  function animatedLook(entry, bound) {
    return lookAt(entry.layer, entry.age, entry.leftAt, bound);
  }

  /**
   * Les valeurs animées d'un réglage vont au composant. Appelé même sans réglage animé : `{}` rend au composant les valeurs réglées à la main.
   * @param {MountedLayer} entry @param {import('./layer-look.js').BoundValues} values
   */
  function driveParams(entry, values) {
    if (typeof entry.instance.drive !== 'function') return;
    entry.instance.drive(paramValues(values));
  }

  /** Reprend toutes les animations de couche au début, comme à l'arrivée de la scène. */
  function restartAnimations() {
    for (const entry of mountedEntries()) entry.age = 0;
  }

  /** Reprend la lecture au début de la scène et prévient les panneaux qui la suivent. */
  function restartPlayback() {
    playback.elapsedMs = 0;
    playback.playing = true;
    for (const listener of timelineListeners) listener(timelineState());
  }

  /** @param {import('./render-clock.js').RenderFrame} frame */
  function tickBindings(frame) {
    clockTime = frame.time;
    if (playback.playing) playback.elapsedMs += frame.dt * 1000;
    for (const entry of mountedEntries()) {
      if (!entry.visible || !isAnimated(entry.layer)) continue;
      entry.age += frame.dt * 1000;
      paint(entry, bindingValues(entry, frame.time, frame.dt));
    }
    for (const entry of leavingEntries()) {
      entry.age += frame.dt * 1000;
      paint(entry, entry.frozen ?? {});
    }
    if (timelineListeners.size > 0) for (const listener of timelineListeners) listener(timelineState());
  }

  /**
   * Écrit le style d'une couche à cet instant ; on n'écrit que ce qui a changé : une couche au repos ne coûte aucune écriture de style.
   * @param {MountedLayer} entry @param {Partial<Record<import('./layer-bindings.js').BindingTarget, number>>} values
   */
  function paint(entry, values) {
    const look = animatedLook(entry, values);
    const key = JSON.stringify(look);
    if (key === entry.appliedKey) return;
    entry.appliedKey = key;
    driveParams(entry, values);
    entry.instance.animate?.(look.content ?? null);
    Object.assign(entry.calque.style, lookStyles(entry.layer, look));
  }

  /** Vrai si une couche a quelque chose à évaluer à chaque image : des liaisons, des images clés ou une animation. @param {Layer} layer */
  function isAnimated(layer) {
    return layer.bindings !== undefined || hasKeys(layer.timeline) || layer.animation !== undefined;
  }

  /** L'horloge tourne tant qu'une couche montée a des liaisons ou des images clés, et pas plus. */
  function syncClock() {
    const needed = mountedEntries().some((entry) => entry.visible && isAnimated(entry.layer)) || leavingEntries().length > 0;
    if (needed && stopClock === null) stopClock = clock.subscribe(tickBindings);
    else if (!needed && stopClock !== null) { stopClock(); stopClock = null; }
  }

  /**
   * Réconcilie une scène avec une pile existante (ou neuve). Les groupes se placent d'abord : leurs couches se montent dans leur calque.
   * @param {Stage} stage @param {{ layers: Layer[] }} scene
   */
  function reconcile(stage, scene) {
    const wanted = new Set(scene.layers.map(({ id }) => id));
    for (const [id, entry] of stage.layers) {
      if (!wanted.has(id)) {
        disposeLayer(entry);
        stage.layers.delete(id);
      }
    }

    // The box of each group comes from its members, not from the placement the document carries (which the canonical form keeps in step, but a stale one must not misplace the center).
    const boxes = new Map(scene.layers.filter((layer) => isGroupKind(layer.kind)).map((group) => {
      const members = scene.layers.filter((layer) => layer.group === group.id);
      return [group.id, members.length === 0 ? group.placement : boundingBox(members.map((member) => member.placement))];
    }));
    /** @type {Map<string, MountedLayer>} */
    const next = new Map();

    /** @param {Layer} layer @param {number} index */
    function place(layer, index) {
      let entry = stage.layers.get(layer.id);
      // A hidden layer draws nothing: we do not keep it mounted for nothing.
      if (!layer.visible) {
        if (entry !== undefined) disposeLayer(entry);
        return;
      }
      const owner = layer.group === undefined ? undefined : next.get(layer.group);
      // The group is hidden or failed to mount (reported): its layers have nowhere to go, they draw nothing.
      if (layer.group !== undefined && owner === undefined) {
        if (entry !== undefined) disposeLayer(entry);
        return;
      }
      const container = owner === undefined ? stage.calque : owner.instance.el;
      try {
        if (entry === undefined) {
          entry = mountLayer(stage, layer, container);
        } else if (entry.kind !== layer.kind) {
          // Le nouveau est monté avant que l'ancien ne parte : s'il échoue, l'ancien reste affiché.
          const replacement = mountLayer(stage, layer, container);
          disposeLayer(entry);
          entry = replacement;
        } else {
          entry.instance.update?.(layer.options);
          if (entry.parent !== (layer.group ?? null)) {
            container.appendChild(entry.calque);
            entry.parent = layer.group ?? null;
          }
        }
      } catch (error) {
        onLayerError({ layerId: layer.id, error });
      }
      if (entry === undefined) return;
      styleLayer(entry, layer, index, boxes.get(layer.id));
      next.set(layer.id, entry);
    }

    scene.layers.forEach((layer, index) => { if (isGroupKind(layer.kind)) place(layer, index); });
    scene.layers.forEach((layer, index) => { if (!isGroupKind(layer.kind)) place(layer, index); });
    // The table keeps the order of the scene: it is what `layers()` lists.
    stage.layers = new Map(scene.layers.flatMap(({ id }) => {
      const entry = next.get(id);
      return entry === undefined ? [] : [[id, entry]];
    }));
  }

  /**
   * Superpose la nouvelle scène à l'ancienne, puis retire l'ancienne à la fin.
   * @param {Stage} next
   * @param {import('./background-transition.js').BackgroundTransition} transition
   */
  function runTransition(next, transition) {
    const { incoming, outgoing: outgoingStyles } = transitionStyles(transition);
    Object.assign(next.calque.style, incoming.from);

    const previous = current;
    // Les couches de la scène qui part jouent leur sortie : elle reste en place le temps de la plus longue, puis sa propre transition commence.
    const hold = previous === null ? 0 : startLeaving(previous);
    current = next;
    playback.elapsedMs = 0;
    if (previous !== null) {
      Object.assign(previous.calque.style, outgoingStyles.from);
      outgoing.push(previous);
    }

    scheduleFrame(() => {
      // Sans cette lecture, le navigateur n'a jamais résolu l'état de départ : il voit uniquement
      // la valeur finale et l'applique d'un coup, sans animer. Mesuré en vrai (clip-path calculé
      // figé à `inset(0px)` pendant toute la durée) avant d'ajouter ce flush.
      forceStyleFlush(next.calque);
      const timing = `${transition.durationMs}ms ${cssEasing(transition.easing)}`;
      // Une durée par propriété : `a, b 400ms` donnerait 0s à `a` et ferait sauter l'animation.
      const timingFor = (/** @type {string[]} */ properties) => properties.map((name) => `${name} ${timing}`).join(', ');
      next.calque.style.transition = timingFor(incoming.properties);
      Object.assign(next.calque.style, incoming.to);

      // Le sortant est animé lui aussi : les effets peignent sur des canvas transparents, donc
      // révéler l'entrant ne le masque pas. Sans ça il reste visible puis disparaît d'un coup.
      if (previous !== null) {
        const fadeOut = () => {
          // Une transition plus récente a pu retirer la scène entre-temps.
          if (!outgoing.includes(previous)) return;
          previous.calque.style.transition = timingFor(outgoingStyles.properties);
          Object.assign(previous.calque.style, outgoingStyles.to);
        };
        if (hold === 0) fadeOut();
        else scheduleTimeout(fadeOut, hold);
      }
    });

    scheduleTimeout(() => {
      // Une transition plus récente a pu passer entre-temps : elle a déjà nettoyé, ne rien défaire.
      if (current !== next) return;
      flushOutgoing();
      clearTransitionStyles(next.calque);
      syncClock();
    }, hold + transition.durationMs);
  }

  /**
   * Prévient les couches d'une scène qui part qu'elle part : celles qui ont une sortie « au départ » la jouent depuis cet instant, leurs valeurs de base figées.
   * @param {Stage} stage
   * @returns {number} le temps que la scène doit rester en place pour que la plus longue sortie finisse
   */
  function startLeaving(stage) {
    let hold = 0;
    for (const entry of stage.layers.values()) {
      const delay = leaveDelayMs(entry.layer.animation);
      if (delay === 0) continue;
      entry.leftAt = entry.age;
      entry.frozen = bindingValues(entry, clockTime, 0);
      hold = Math.max(hold, delay);
    }
    return hold;
  }

  /** @param {SceneDoc} fullScene */
  function applyScene(fullScene) {
    reconcileIdentity(fullScene.layers.filter(({ kind }) => identityOf(kind)));
    const scene = { ...fullScene, layers: fullScene.layers.filter(({ kind }) => !identityOf(kind)) };
    if (scene.layers.length === 0) {
      unmountEffects();
      return;
    }

    const transition = scene.transition === undefined ? null : normalizeTransition(scene.transition);

    // Un réglage en cours : mise à jour en direct, jamais d'animation.
    if (transition === null && current !== null) {
      reconcile(current, scene);
      return;
    }

    // Premier montage, durée nulle, ou arrivée : une nouvelle pile. Une Browser Source qui s'ouvre ne
    // commence pas par un fondu.
    const stage = createStage();
    reconcile(stage, scene);
    if (stage.layers.size === 0) {
      stage.calque.remove();
      return;
    }
    if (transition === null || transition.durationMs === 0 || current === null) {
      const previous = current;
      current = stage;
      playback.elapsedMs = 0;
      flushOutgoing();
      if (previous !== null) disposeStage(previous);
      return;
    }
    runTransition(stage, transition);
  }

  /** Couches visibles de la scène affichée, pour le routage. */
  function visibleLayers() {
    return current === null ? [] : [...current.layers.values()].filter(({ visible }) => visible);
  }

  /** @param {MountedLayer} entry */
  function wantsAudio(entry) {
    return capabilitiesOf(entry.kind).audio && isAudioOn(entry.options.audioReactive);
  }

  return {
    /** @param {SceneDoc} scene */
    apply(scene) {
      latestScene = scene;
      if (!paused) applyScene(scene);
      syncClock();
      onMountChange();
    },

    /**
     * Réaction traitée nativement par au moins une couche visible ? `false` : l'appelant la fait dessiner
     * par la surcouche partagée, une seule fois quel que soit le nombre de couches.
     * @param {*} event
     * @returns {boolean}
     */
    react(event) {
      const native = visibleLayers().filter(({ kind }) => capabilitiesOf(kind).reactions === 'native');
      for (const entry of native) entry.instance.trigger?.(event);
      // Une couche qui reçoit les alertes (le code d'une couche Code) les reçoit sans que la surcouche en soit privée.
      for (const entry of visibleLayers()) if (capabilitiesOf(entry.kind).events === true) entry.instance.trigger?.(event);
      if (typeof event?.type === 'string') {
        recordPulse(pulses, event.type, clockTime);
        // Une alerte que la scène a choisie relance son animation (« un raid rejoue l'entrée »).
        if (restartsOn(sceneTimeline(), event.type)) restartPlayback();
        // Une alerte que la couche a choisie rejoue sa propre animation, sans toucher aux autres couches.
        for (const entry of mountedEntries()) if (restartsAnimationOn(entry.layer.animation, event.type)) entry.age = 0;
      }
      return native.length > 0;
    },

    /**
     * La lecture de la timeline : l'éditeur du Studio la pilote (lecture, pause, position) ; la page de rendu d'OBS la laisse tourner depuis
     * l'arrivée de la scène. Aucune de ces commandes ne modifie la scène.
     */
    timeline: {
      state: timelineState,
      play() { playback.playing = true; },
      pause() { playback.playing = false; },
      /** Reprend au début de la scène, comme à son arrivée : la timeline et l'animation de chaque couche. */
      restart() {
        restartPlayback();
        restartAnimations();
      },
      /** @param {number} ms se place à cet instant (borné à la durée) et met la scène en pause : on regarde cette image */
      seek(ms) {
        playback.playing = false;
        playback.elapsedMs = Math.min(Math.max(0, ms), sceneTimeline().durationMs);
        for (const entry of mountedEntries()) {
          if (!entry.visible || !isAnimated(entry.layer)) continue;
          entry.appliedKey = '';
          Object.assign(entry.calque.style, lookStyles(entry.layer, animatedLook(entry, bindingValues(entry, clockTime, 0))));
        }
        for (const listener of timelineListeners) listener(timelineState());
      },
      /** @param {(state: ReturnType<typeof timelineState>) => void} listener @returns {() => void} */
      subscribe(listener) {
        timelineListeners.add(listener);
        return () => timelineListeners.delete(listener);
      },
    },

    isAudioReactive() {
      return visibleLayers().some((entry) => wantsAudio(entry) || usesAudio(entry.layer.bindings));
    },

    /** @param {*} next @returns {boolean} */
    applyAudio(next) {
      levels = next;
      levelsAt = clockTime;
      const listeners = visibleLayers().filter((entry) => wantsAudio(entry) || usesAudio(entry.layer.bindings));
      for (const entry of listeners) if (wantsAudio(entry)) entry.instance.setAudioLevel?.(next);
      return listeners.length > 0;
    },

    /** @param {boolean} nextPaused */
    setPaused(nextPaused) {
      if (paused === nextPaused) return;
      paused = nextPaused;
      if (paused) unmountAll();
      else if (latestScene !== null) {
        const { transition: _arrival, ...setting } = latestScene;
        applyScene(setting);
      }
      onMountChange();
    },

    /** Couches de la scène affichée, dans l'ordre. @returns {MountedLayerInfo[]} */
    layers() {
      const stages = [current, identity].filter((stage) => stage !== null);
      return stages.flatMap((stage) => [...stage.layers.values()].map(({ id, kind, instance, visible }) => ({ id, kind, instance, visible })));
    },

    /** Nombre de calques de scène présents : un en régime stable, deux pendant une transition. */
    stageCount() {
      return (current === null ? 0 : 1) + outgoing.length;
    },

    destroy() {
      sizeObserver?.disconnect();
      stopClock?.();
      stopClock = null;
      latestScene = null;
      unmountAll();
      onMountChange();
    },
  };
}

/**
 * Efface toute trace de la transition sur le calque survivant. Sans ça, son masque et sa durée
 * restent inscrits en style inline bien après l'animation.
 * @param {*} calque
 */
function clearTransitionStyles(calque) {
  for (const property of [
    'transition', 'opacity',
    'maskImage', 'WebkitMaskImage', 'maskSize', 'WebkitMaskSize',
    'maskRepeat', 'WebkitMaskRepeat', 'maskPosition', 'WebkitMaskPosition',
  ]) {
    calque.style[property] = '';
  }
}

/**
 * Force la résolution des styles en attente sur un calque. No-op sur les calques factices des
 * tests, qui n'ont pas de géométrie.
 * @param {*} calque
 */
function forceStyleFlush(calque) {
  return typeof calque.offsetWidth === 'number' ? calque.offsetWidth : 0;
}

/** Calque réel d'une couche. Isolé ici pour que les tests n'aient pas besoin d'un DOM. */
function defaultCreateCalque() {
  const calque = document.createElement('div');
  calque.style.cssText = 'position:absolute;overflow:hidden;pointer-events:none;';
  return calque;
}

/** Calque réel d'une scène : plein écran, c'est lui qu'une transition fait apparaître ou disparaître. */
function defaultCreateStageCalque() {
  const calque = document.createElement('div');
  calque.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  return calque;
}
