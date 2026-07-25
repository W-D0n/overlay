// @ts-check
import { computeLevels, SILENT_LEVELS } from './audio-levels.js';

/**
 * background-audio.js — Session micro partagée par l'URL OBS et l'aperçu du tuner.
 *
 * Acquisition paresseuse : tant qu'aucun effet réactif n'est monté, `getUserMedia` n'est jamais
 * appelé et aucune LED micro ne s'allume. La perte du flux ne remonte jamais à l'écran : l'effet
 * reprend son animation normale et une nouvelle tentative est programmée.
 * Voir docs/specs/background-audio-reactivity.md.
 */

/** Reculs successifs entre deux tentatives, en ms ; la dernière valeur se répète indéfiniment. */
export const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000];

/** @param {number} attempt */
export function retryDelayMs(attempt) {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
}

/**
 * @param {{
 *   mount: { isAudioReactive(): boolean, applyAudio(levels: import('./audio-levels.js').AudioLevels): boolean },
 *   requestMicrophone: () => Promise<{ stream: unknown, spectrum: Uint8Array, sampleRate: number, read: () => void, stop: () => void }>,
 *   scheduleFrame: (callback: () => void) => void,
 *   scheduleRetry: (callback: () => void, delayMs: number) => void,
 *   onStateChange?: (state: { status: 'idle' | 'active' | 'unavailable', reason: string | null }) => void,
 * }} deps
 */
export function createAudioSession(deps) {
  /** @type {'idle' | 'active' | 'unavailable'} */
  let status = 'idle';
  /** @type {string | null} */
  let reason = null;
  /** @type {{ spectrum: Uint8Array, sampleRate: number, read: () => void, stop: () => void } | null} */
  let capture = null;
  let levels = SILENT_LEVELS;
  let attempt = 0;
  let enabled = false;
  let acquiring = false;
  let frameScheduled = false;

  function publish(nextStatus, nextReason = null) {
    if (status === nextStatus && reason === nextReason) return;
    status = nextStatus;
    reason = nextReason;
    deps.onStateChange?.({ status, reason });
  }

  function releaseCapture() {
    capture?.stop();
    capture = null;
    levels = SILENT_LEVELS;
  }

  function frame() {
    frameScheduled = false;
    if (!enabled || capture === null) return;

    capture.read();
    levels = computeLevels({
      spectrum: capture.spectrum,
      sampleRate: capture.sampleRate,
      previous: levels,
    });
    deps.mount.applyAudio(levels);
    requestFrame();
  }

  function requestFrame() {
    if (frameScheduled || !enabled || capture === null) return;
    frameScheduled = true;
    deps.scheduleFrame(frame);
  }

  function scheduleRetry() {
    const delay = retryDelayMs(attempt);
    attempt += 1;
    deps.scheduleRetry(() => { if (enabled) acquire(); }, delay);
  }

  async function acquire() {
    if (acquiring || capture !== null || !enabled) return;
    acquiring = true;
    try {
      capture = await deps.requestMicrophone();
      // L'effet a pu être démonté pendant l'attente de l'autorisation : ne pas garder un flux
      // ouvert pour personne.
      if (!enabled) { releaseCapture(); return; }
      attempt = 0;
      publish('active');
      requestFrame();
    } catch (error) {
      capture = null;
      publish('unavailable', error instanceof Error ? error.name : 'UnknownError');
      scheduleRetry();
    } finally {
      acquiring = false;
    }
  }

  return {
    /**
     * À appeler après chaque montage d'effet : décide seul s'il faut ouvrir ou relâcher le micro.
     * @returns {void}
     */
    sync() {
      const shouldRun = deps.mount.isAudioReactive();
      if (shouldRun === enabled) {
        if (shouldRun) requestFrame();
        return;
      }
      enabled = shouldRun;

      if (!enabled) {
        releaseCapture();
        attempt = 0;
        publish('idle');
        return;
      }
      acquire();
    },

    /** Perte du flux en cours de route (micro débranché) — jamais une erreur fatale. */
    handleStreamLost() {
      if (!enabled) return;
      releaseCapture();
      publish('unavailable', 'StreamEnded');
      scheduleRetry();
    },

    getState() {
      return { status, reason };
    },

    destroy() {
      enabled = false;
      releaseCapture();
      publish('idle');
    },
  };
}
