// @ts-check
/**
 * components/layer-test-harness.js — Banc de test des effets canvas : horloge pilotée à la main, canvas
 * factice dont le contexte enregistre chaque appel de dessin. Utilisé uniquement par les tests.
 */
import { createRenderClock } from '../render-clock.js';

/**
 * @param {{ width?: number, height?: number }} [size]
 */
export function createLayerHarness({ width = 1920, height = 1080 } = {}) {
  /** @type {any[][]} */
  let calls = [];
  const ctx = new Proxy({}, {
    get: (_, name) => (/** @type {any[]} */ ...args) => { calls.push([String(name), ...args]); },
    set: (_, name, value) => { calls.push(['set', String(name), value]); return true; },
  });
  const canvas = { style: {}, offsetWidth: width, offsetHeight: height, width: 0, height: 0, getContext: () => ctx };

  /** @type {((timestamp: number) => void) | null} */
  let pending = null;
  const clock = createRenderClock({
    requestFrame: (callback) => { pending = callback; return 1; },
    cancelFrame: () => { pending = null; },
    devicePixelRatio: () => 1,
  });

  return {
    environment: {
      clock,
      documentRef: /** @type {any} */ ({ createElement: () => canvas }),
      ResizeObserverImpl: /** @type {any} */ (class { observe() {} disconnect() {} }),
    },
    /** Joue une frame à l'horodatage donné (ms) et renvoie les appels de dessin de cette frame. */
    tick(/** @type {number} */ timestamp) {
      calls = [];
      const callback = pending;
      pending = null;
      callback?.(timestamp);
      return calls;
    },
  };
}
