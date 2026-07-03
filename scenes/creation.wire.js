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
  const [statViewers] = mounted.componentsByLayer.stats;
  const toolNameEl   = mounted.root.querySelector('.creation-tool-name');
  const toolDetailEl = mounted.root.querySelector('.creation-tool-detail');
  const toolAppEl    = mounted.root.querySelector('.creation-tool-app');

  return onStateChange((state) => {
    statViewers.update?.({ value: state.viewers > 0 ? state.viewers.toLocaleString('fr-FR') : '—' });
    pomodoro.update?.(state.pomodoro);
    if (toolNameEl)   toolNameEl.textContent   = state.currentTool     || '—';
    if (toolDetailEl) toolDetailEl.textContent = state.currentFile     || '';
    if (toolAppEl)    toolAppEl.textContent    = state.currentActivity || '';
  });
}
