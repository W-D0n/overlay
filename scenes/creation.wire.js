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

  return onStateChange((state) => {
    pomodoro.update?.(state.pomodoro);
  });
}
