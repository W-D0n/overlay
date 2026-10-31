// @ts-check
import { COMPONENT_REGISTRY } from './component-registry.js';
import { cssEasing, normalizeTransition, transitionStyles } from './background-transition.js';
import { isAudioOn, isIdentityKind, kindCapabilities } from './layer-kinds.js';
import { referenceScale } from './render-reference.js';
import { evaluateBindings, recordPulse, usesAudio } from './layer-bindings.js';
import { getRenderClock } from './render-clock.js';
import { CROP_SIDES } from './scene-doc.js';

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
 * @typedef {{ id: string, kind: string, instance: import('./types.js').ComponentInstance, calque: *, visible: boolean, options: Record<string, unknown>, layer: Layer, memory: number[], appliedKey: string }} MountedLayer
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
   * Monte une couche dans une scène. Lève si le type est inconnu ou si la fabrique échoue.
   * @param {Stage} stage @param {Layer} layer @returns {MountedLayer}
   */
  function mountLayer(stage, layer) {
    const factory = Object.hasOwn(registry, layer.kind) ? registry[layer.kind] : undefined;
    if (factory === undefined) throw new Error(`type de couche inconnu : ${layer.kind}`);
    const instance = factory(layer.options, { sceneHeight: () => container.clientHeight });
    const calque = createCalque();
    calque.appendChild(instance.el);
    stage.calque.appendChild(calque);
    return { id: layer.id, kind: layer.kind, instance, calque, visible: layer.visible, options: layer.options, layer, memory: [], appliedKey: '' };
  }

  /** @param {MountedLayer} entry @param {Layer} layer @param {number} index */
  function styleLayer(entry, layer, index) {
    const { x, y, width, height } = layer.placement;
    entry.visible = layer.visible;
    entry.options = layer.options;
    // Des liaisons nouvelles repartent de zéro (le niveau lissé d'une ancienne liaison n'a plus de sens).
    if (entry.layer.bindings !== layer.bindings) entry.memory = [];
    entry.layer = layer;
    entry.appliedKey = '';
    Object.assign(entry.calque.style, {
      left: percent(x),
      top: percent(y),
      width: percent(width),
      height: percent(height),
      display: layer.visible ? '' : 'none',
      zIndex: String(index),
      ...lookStyles(layer, bindingValues(entry, clockTime, 0)),
    });
    syncClock();
  }

  /** Toutes les couches montées, effets et identité. @returns {MountedLayer[]} */
  function mountedEntries() {
    return [...(current === null ? [] : current.layers.values()), ...(identity === null ? [] : identity.layers.values())];
  }

  /**
   * Les valeurs liées d'une couche à un instant.
   * @param {MountedLayer} entry @param {number} time @param {number} dt
   */
  function bindingValues(entry, time, dt) {
    const bindings = entry.layer.bindings;
    if (bindings === undefined || bindings.length === 0) return {};
    // Un son qui n'arrive plus (micro coupé) vaut le silence, pas son dernier niveau.
    const live = time - levelsAt < 0.5 ? levels : null;
    return evaluateBindings(bindings, { levels: live, pulses, time, dt, memory: entry.memory });
  }

  /** @param {import('./render-clock.js').RenderFrame} frame */
  function tickBindings(frame) {
    clockTime = frame.time;
    for (const entry of mountedEntries()) {
      if (!entry.visible || entry.layer.bindings === undefined) continue;
      const values = bindingValues(entry, frame.time, frame.dt);
      // On n'écrit que ce qui a changé : une liaison au repos ne coûte aucune écriture de style.
      const key = JSON.stringify(values);
      if (key === entry.appliedKey) continue;
      entry.appliedKey = key;
      Object.assign(entry.calque.style, lookStyles(entry.layer, values));
    }
  }

  /** L'horloge tourne tant qu'une couche montée a des liaisons, et pas plus. */
  function syncClock() {
    const needed = mountedEntries().some((entry) => entry.visible && entry.layer.bindings !== undefined);
    if (needed && stopClock === null) stopClock = clock.subscribe(tickBindings);
    else if (!needed && stopClock !== null) { stopClock(); stopClock = null; }
  }

  /**
   * Réconcilie une scène avec une pile existante (ou neuve).
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

    /** @type {Map<string, MountedLayer>} */
    const next = new Map();
    scene.layers.forEach((layer, index) => {
      let entry = stage.layers.get(layer.id);
      if (!layer.visible) {
        // Une couche masquée ne dessine rien : on ne la garde pas montée pour rien.
        if (entry !== undefined) disposeLayer(entry);
        return;
      }
      try {
        if (entry === undefined) {
          entry = mountLayer(stage, layer);
        } else if (entry.kind !== layer.kind) {
          // Le nouveau est monté avant que l'ancien ne parte : s'il échoue, l'ancien reste affiché.
          const replacement = mountLayer(stage, layer);
          disposeLayer(entry);
          entry = replacement;
        } else {
          entry.instance.update?.(layer.options);
        }
      } catch (error) {
        onLayerError({ layerId: layer.id, error });
      }
      if (entry === undefined) return;
      styleLayer(entry, layer, index);
      next.set(layer.id, entry);
    });
    stage.layers = next;
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
    current = next;
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
        previous.calque.style.transition = timingFor(outgoingStyles.properties);
        Object.assign(previous.calque.style, outgoingStyles.to);
      }
    });

    scheduleTimeout(() => {
      // Une transition plus récente a pu passer entre-temps : elle a déjà nettoyé, ne rien défaire.
      if (current !== next) return;
      flushOutgoing();
      clearTransitionStyles(next.calque);
    }, transition.durationMs);
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
      if (typeof event?.type === 'string') recordPulse(pulses, event.type, clockTime);
      return native.length > 0;
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
 * L'opacité et le rendu étendu d'une couche en styles du calque. Une valeur absente donne la chaîne vide : le style inline disparaît,
 * la couche se rend comme avant. Le flou se compte en pixels de la source de référence : `--reference-scale` (posée sur
 * le conteneur) l'adapte à la hauteur réelle de la source. Les valeurs liées (`layer-bindings.js`) remplacent l'opacité, la rotation
 * et le flou de la couche, et s'ajoutent à son échelle et à son décalage.
 * @param {Layer} layer
 * @param {Partial<Record<import('./layer-bindings.js').BindingTarget, number>>} [bound]
 * @returns {{ opacity: string, mixBlendMode: string, transform: string, clipPath: string, filter: string }}
 */
function lookStyles(layer, bound = {}) {
  const { blend, crop } = layer;
  const rotation = bound.rotation ?? layer.rotation ?? 0;
  const blur = bound.blur ?? layer.blur ?? 0;
  const shift = (bound.x ?? 0) !== 0 || (bound.y ?? 0) !== 0 ? `translate(${Number((bound.x ?? 0).toFixed(3))}%, ${Number((bound.y ?? 0).toFixed(3))}%)` : '';
  const turn = rotation === 0 ? '' : `rotate(${Number(rotation.toFixed(3))}deg)`;
  const grow = bound.scale === undefined || bound.scale === 1 ? '' : `scale(${Number(bound.scale.toFixed(4))})`;
  return {
    opacity: String(bound.opacity === undefined ? layer.opacity : Number(bound.opacity.toFixed(4))),
    mixBlendMode: blend === undefined || blend === 'normal' ? '' : blend,
    transform: [shift, turn, grow].filter((part) => part !== '').join(' '),
    clipPath: crop === undefined ? '' : `inset(${CROP_SIDES.map((side) => percent(crop[side] ?? 0)).join(' ')})`,
    filter: blur === 0 ? '' : `blur(calc(var(--reference-scale, 1) * ${Number(blur.toFixed(3))}px))`,
  };
}

/** @param {number} fraction @returns {string} */
function percent(fraction) {
  return `${Number((fraction * 100).toFixed(4))}%`;
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
