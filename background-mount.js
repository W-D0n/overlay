// @ts-check
import { COMPONENT_REGISTRY } from './component-registry.js';
import { cssEasing, normalizeTransition, transitionStyles } from './background-transition.js';

/**
 * background-mount.js — Montage d'un effet de fond standalone dans un conteneur (2026-07-14).
 *
 * Logique AD-B2 (docs/specs/background-effects-library.md) extraite hors du moteur de scènes,
 * partagée par `background.html` (URL OBS) et `dev/background-tuner.html` :
 *   - même `component` qu'avant → `update(options)`, jamais de recréation inutile ;
 *   - `component` différent → montage du nouveau, démontage de l'ancien ;
 *   - `component: null` → démontage, conteneur vide.
 *
 * Chaque effet vit dans son propre calque plein écran : c'est ce qui permet de superposer l'entrant
 * et le sortant pendant une transition (docs/specs/background-preset-transitions.md). Un état porteur
 * d'une `transition` est une arrivée de preset (on anime) ; sans elle, c'est un réglage (on met à
 * jour en direct). Voir docs/specs/background-standalone.md.
 *
 * @param {HTMLElement} container - Conteneur plein écran (ex : `#bg-layer`)
 * @param {{
 *   registry?: typeof COMPONENT_REGISTRY,
 *   onMountChange?: () => void,
 *   createLayer?: () => *,
 *   scheduleFrame?: (callback: () => void) => void,
 *   scheduleTimeout?: (callback: () => void, delayMs: number) => void,
 * }} [options] - Points d'injection pour les tests du cycle de vie (aucun DOM requis).
 */
export function createBackgroundMount(container, options = {}) {
  const registry = options.registry ?? COMPONENT_REGISTRY;
  const onMountChange = options.onMountChange ?? (() => {});
  const createLayer = options.createLayer ?? defaultCreateLayer;
  const scheduleFrame = options.scheduleFrame
    ?? ((callback) => globalThis.requestAnimationFrame?.(callback) ?? callback());
  const scheduleTimeout = options.scheduleTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));

  /** @type {{ instance: import('./types.js').ComponentInstance, layer: *, component: string } | null} */
  let mounted = null;
  /** @type {{ instance: import('./types.js').ComponentInstance, layer: * }[]} */
  let outgoing = [];
  /** @type {{ component: string | null, options: Record<string, unknown> } | null} */
  let latestState = null;
  let paused = false;

  function disposeLayer({ instance, layer }) {
    instance.destroy?.();
    layer.remove();
  }

  /** Termine toute transition en cours : le calque le plus récent gagne, les autres partent. */
  function flushOutgoing() {
    for (const layer of outgoing) disposeLayer(layer);
    outgoing = [];
  }

  function unmount() {
    flushOutgoing();
    if (mounted !== null) disposeLayer(mounted);
    mounted = null;
  }

  /**
   * @param {string} component
   * @param {Record<string, unknown>} componentOptions
   */
  function mountLayer(component, componentOptions) {
    const factory = registry[/** @type {import('./types.js').ComponentName} */ (component)];
    if (factory === undefined) throw new Error(`effet de fond inconnu : ${component}`);

    const instance = factory(componentOptions);
    const layer = createLayer();
    layer.appendChild(instance.el);
    container.appendChild(layer);
    return { instance, layer, component };
  }

  /**
   * Superpose le nouveau calque au-dessus de l'ancien, puis retire l'ancien à la fin.
   * @param {*} next
   * @param {import('./background-transition.js').BackgroundTransition} transition
   */
  function runTransition(next, transition) {
    const { incoming, outgoing: outgoingStyles } = transitionStyles(transition);
    Object.assign(next.layer.style, incoming.from);

    const previous = mounted;
    mounted = next;
    if (previous !== null) {
      Object.assign(previous.layer.style, outgoingStyles.from);
      outgoing.push(previous);
    }

    scheduleFrame(() => {
      // Sans cette lecture, le navigateur n'a jamais résolu l'état de départ : il voit uniquement
      // la valeur finale et l'applique d'un coup, sans animer. Mesuré en vrai (clip-path calculé
      // figé à `inset(0px)` pendant toute la durée) avant d'ajouter ce flush.
      forceStyleFlush(next.layer);
      const timing = `${transition.durationMs}ms ${cssEasing(transition.easing)}`;
      next.layer.style.transition = `${incoming.property} ${timing}`;
      Object.assign(next.layer.style, incoming.to);

      // Le sortant est animé lui aussi : les effets peignent sur des canvas transparents, donc
      // révéler l'entrant ne le masque pas. Sans ça il reste visible puis disparaît d'un coup.
      if (previous !== null) {
        previous.layer.style.transition = `${outgoingStyles.property} ${timing}`;
        Object.assign(previous.layer.style, outgoingStyles.to);
      }
    });

    scheduleTimeout(() => {
      // Une transition plus récente a pu passer entre-temps : elle a déjà nettoyé, ne rien défaire.
      if (mounted !== next) return;
      flushOutgoing();
      next.layer.style.transition = '';
    }, transition.durationMs);
  }

  function applyMountedState(state) {
    const { component, options: componentOptions } = state;

    if (component === null) {
      unmount();
      return;
    }

    // Réglage en cours sur le même effet : mise à jour en direct, jamais d'animation.
    if (state.transition === undefined && mounted !== null && mounted.component === component) {
      mounted.instance.update?.(componentOptions);
      return;
    }

    const transition = state.transition === undefined ? null : normalizeTransition(state.transition);

    // Premier montage, durée nulle, ou simple changement d'effet sans transition déclarée :
    // remplacement direct — une Browser Source qui s'ouvre ne commence pas par un fondu.
    if (transition === null || transition.durationMs === 0 || mounted === null) {
      const next = mountLayer(component, componentOptions);
      unmountPrevious(next);
      return;
    }

    runTransition(mountLayer(component, componentOptions), transition);
  }

  /** @param {*} next */
  function unmountPrevious(next) {
    const previous = mounted;
    mounted = next;
    flushOutgoing();
    if (previous !== null) disposeLayer(previous);
  }

  return {
    apply(state) {
      latestState = state;
      if (!paused) applyMountedState(state);
      onMountChange();
    },
    react(event) {
      if (mounted !== null && typeof mounted.instance.trigger === 'function') {
        mounted.instance.trigger(event);
        return true;
      }
      return false;
    },
    isAudioReactive() {
      if (mounted === null || typeof mounted.instance.setAudioLevel !== 'function') return false;
      return isAudioEnabled(latestState?.options);
    },
    applyAudio(levels) {
      if (!this.isAudioReactive()) return false;
      /** @type {*} */ (mounted).instance.setAudioLevel(levels);
      return true;
    },
    setPaused(nextPaused) {
      if (paused === nextPaused) return;
      paused = nextPaused;
      if (paused) unmount();
      else if (latestState !== null) applyMountedState({ ...latestState, transition: undefined });
      onMountChange();
    },
    destroy() {
      latestState = null;
      unmount();
      onMountChange();
    },
    /** Nombre de calques présents — un pendant le régime stable, deux pendant une transition. */
    layerCount() {
      return (mounted === null ? 0 : 1) + outgoing.length;
    },
  };
}

/**
 * Force la résolution des styles en attente sur un calque. No-op sur les calques factices des
 * tests, qui n'ont pas de géométrie.
 * @param {*} layer
 */
function forceStyleFlush(layer) {
  return typeof layer.offsetWidth === 'number' ? layer.offsetWidth : 0;
}

/** Calque plein écran réel. Isolé ici pour que les tests n'aient pas besoin d'un DOM. */
function defaultCreateLayer() {
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  return layer;
}

/**
 * La réactivité audio est un réglage de preset, pas une propriété de l'effet : un effet capable de
 * réagir ne doit pas ouvrir le micro tant que le preset affiché ne le demande pas.
 * @param {Record<string, unknown> | undefined} options
 * @returns {boolean}
 */
export function isAudioEnabled(options) {
  return options?.audioReactive === AUDIO_REACTIVE_ON;
}

/** Valeur du champ `audioReactive` qui active la réactivité (voir dev/component-field-schemas.js). */
export const AUDIO_REACTIVE_ON = 'Oui';
