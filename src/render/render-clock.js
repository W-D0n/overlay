// @ts-check
/**
 * render-clock.js — Horloge unique de la page de rendu.
 *
 * Une seule boucle d'animation pour tous les effets : temps commun, delta borné, pause sans saut,
 * ratio de pixels dérivé de la qualité, et isolement d'un abonné qui lève (un fond figé vaut mieux
 * qu'un fond noir en live). La boucle ne tourne que lorsqu'il existe un abonné et qu'elle n'est pas
 * en pause. `requestFrame` / `cancelFrame` sont injectables : les tests et la future timeline
 * pilotent le temps sans horloge réelle.
 *
 * @typedef {{ dt: number, time: number, pixelRatio: number }} RenderFrame
 * @typedef {(frame: RenderFrame) => void} FrameListener
 */

import { parseRenderUrl } from './render-url.js';

const MAX_DELTA_SECONDS = 0.1;
const MAX_PIXEL_RATIO = 2;

/**
 * @param {{
 *   quality?: import('./render-url.js').RenderQuality,
 *   requestFrame?: (callback: (timestamp: number) => void) => number,
 *   cancelFrame?: (handle: number) => void,
 *   devicePixelRatio?: () => number,
 *   maxDelta?: number,
 *   onError?: (error: Error, listener: FrameListener) => void,
 * }} [options]
 */
export function createRenderClock(options = {}) {
  const requestFrame = options.requestFrame ?? ((callback) => globalThis.requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame ?? ((handle) => globalThis.cancelAnimationFrame(handle));
  const devicePixelRatio = options.devicePixelRatio ?? (() => globalThis.devicePixelRatio ?? 1);
  const maxDelta = options.maxDelta ?? MAX_DELTA_SECONDS;
  const onError = options.onError ?? ((error) => console.error('[clock] couche retirée :', error));

  let quality = options.quality ?? 'auto';
  let paused = false;
  let destroyed = false;
  let handle = 0;
  let running = false;
  /** @type {number | null} */
  let previousTimestamp = null;
  let time = 0;
  /** @type {Set<FrameListener>} */
  const listeners = new Set();

  function pixelRatio() {
    const ratio = devicePixelRatio();
    const safe = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
    return Math.min(safe, quality === 'performance' ? 1 : MAX_PIXEL_RATIO);
  }

  /** @param {number} timestamp */
  function tick(timestamp) {
    running = false;
    const dt = previousTimestamp === null
      ? 0
      : Math.min(maxDelta, Math.max(0, (timestamp - previousTimestamp) / 1000));
    previousTimestamp = timestamp;
    time += dt;

    const frame = { dt, time, pixelRatio: pixelRatio() };
    for (const listener of [...listeners]) {
      try {
        listener(frame);
      } catch (error) {
        listeners.delete(listener);
        onError(error instanceof Error ? error : new Error(String(error)), listener);
      }
    }
    schedule();
  }

  function schedule() {
    if (running || paused || destroyed || listeners.size === 0) return;
    running = true;
    handle = requestFrame(tick);
  }

  function stop() {
    if (!running) return;
    cancelFrame(handle);
    running = false;
  }

  return {
    /** Ratio de pixels courant, pour dimensionner un canvas avant la première frame. */
    pixelRatio,
    /**
     * @param {FrameListener} listener
     * @returns {() => void}
     */
    subscribe(listener) {
      if (destroyed) return () => {};
      listeners.add(listener);
      schedule();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    /** @param {boolean} value */
    setPaused(value) {
      paused = value;
      if (paused) {
        stop();
      } else {
        // La reprise ne compte pas le temps passé en pause : première frame à dt = 0.
        previousTimestamp = null;
        schedule();
      }
    },
    /** @param {import('./render-url.js').RenderQuality} value */
    setQuality(value) {
      quality = value;
    },
    destroy() {
      destroyed = true;
      stop();
      listeners.clear();
    },
  };
}

/**
 * Phase intégrée : la position avance de `delta` à chaque frame, donc un changement de vitesse
 * (réaction audio, curseur du tuner) n'affecte que l'avenir. `temps absolu × facteur` déplace au
 * contraire tout instantanément, d'autant plus que le live dure.
 */
export function createPhase() {
  let value = 0;
  return {
    /** @param {number} delta Déjà multiplié par la vitesse courante (`dt × vitesse`). */
    advance(delta) {
      value += delta;
      return value;
    },
    get value() {
      return value;
    },
  };
}

/**
 * Adaptateur `requestAnimationFrame`-like sur l'horloge : chaque demande est servie une fois, à la
 * prochaine frame de la boucle commune. Pour les modules à boucle paresseuse (réactions) qui n'ont pas
 * à posséder la leur.
 * @param {Pick<ReturnType<typeof createRenderClock>, 'subscribe'>} clock
 */
export function createFrameRequester(clock) {
  let nextId = 1;
  /** @type {Map<number, () => void>} */
  const pending = new Map();
  return {
    /** @param {() => void} callback @returns {number} */
    requestFrame(callback) {
      const id = nextId;
      nextId += 1;
      const stop = clock.subscribe(() => {
        pending.delete(id);
        stop();
        callback();
      });
      pending.set(id, stop);
      return id;
    },
    /** @param {number} id */
    cancelFrame(id) {
      pending.get(id)?.();
      pending.delete(id);
    },
  };
}

/** @type {ReturnType<typeof createRenderClock> | null} */
let sharedClock = null;

/** Horloge de la page : une seule boucle pour tous les effets montés, qualité lue dans l'URL. */
export function getRenderClock() {
  sharedClock ??= createRenderClock({ quality: parseRenderUrl(globalThis.location?.search ?? '').quality });
  return sharedClock;
}
