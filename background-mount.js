// @ts-check
import { COMPONENT_REGISTRY } from './component-registry.js';

/**
 * background-mount.js — Montage d'un effet de fond standalone dans un conteneur (2026-07-14).
 *
 * Logique AD-B2 (docs/specs/background-effects-library.md) extraite hors du moteur de scènes,
 * partagée par `background.html` (URL OBS) et `dev/background-tuner.html` :
 *   - même `component` qu'avant → `update(options)`, jamais de recréation inutile ;
 *   - `component` différent → `destroy()` de l'ancien, montage du nouveau ;
 *   - `component: null` → démontage, conteneur vide.
 * Voir docs/specs/background-standalone.md.
 *
 * @param {HTMLElement} container - Conteneur plein écran (ex : `#bg-layer`)
 * @param {typeof COMPONENT_REGISTRY} [registry] - Point d'injection pour les tests du cycle de vie.
 * @returns {{ apply(state: { component: string | null, options: Record<string, unknown> }): void, setPaused(paused: boolean): void, destroy(): void }}
 */
export function createBackgroundMount(container, registry = COMPONENT_REGISTRY) {
  /** @type {import('./types.js').ComponentInstance | null} */
  let instance = null;
  /** @type {string | null} */
  let mountedComponent = null;
  /** @type {{ component: string | null, options: Record<string, unknown> } | null} */
  let latestState = null;
  let paused = false;

  function unmount() {
    instance?.destroy?.();
    instance?.el.remove();
    instance = null;
    mountedComponent = null;
  }

  function applyMountedState(state) {
    const { component, options } = state;

    if (component === null) {
      unmount();
      return;
    }

    if (component === mountedComponent && instance !== null) {
      instance.update?.(options);
      return;
    }

    const factory = registry[/** @type {import('./types.js').ComponentName} */ (component)];
    if (factory === undefined) throw new Error(`effet de fond inconnu : ${component}`);

    unmount();
    instance = factory(options);
    container.appendChild(instance.el);
    mountedComponent = component;
  }

  return {
    apply(state) {
      latestState = state;
      if (!paused) applyMountedState(state);
    },
    setPaused(nextPaused) {
      if (paused === nextPaused) return;
      paused = nextPaused;
      if (paused) unmount();
      else if (latestState !== null) applyMountedState(latestState);
    },
    destroy() {
      latestState = null;
      unmount();
    },
  };
}
