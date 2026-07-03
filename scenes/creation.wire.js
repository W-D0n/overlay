// @ts-check
/**
 * creation.wire.js — Câblage des composants de la scène Création 3D / Dessin (AD-6).
 */
import { onStateChange } from '../store.js';

/**
 * @param {import('../types.js').MountedScene} mounted
 * @returns {() => void} cleanup (désabonnement)
 */
export function wire(mounted) {
  const [pomodoro] = mounted.componentsByLayer.pomodoro;
  const toolNameEl   = mounted.root.querySelector('.creation-tool-name');
  const toolDetailEl = mounted.root.querySelector('.creation-tool-detail');
  const toolAppEl    = mounted.root.querySelector('.creation-tool-app');

  return onStateChange((state) => {
    pomodoro.update?.(state.pomodoro);
    if (toolNameEl)   toolNameEl.textContent   = state.currentTool     || '—';
    if (toolDetailEl) toolDetailEl.textContent = state.currentFile     || '';
    if (toolAppEl)    toolAppEl.textContent    = state.currentActivity || '';
  });
}
