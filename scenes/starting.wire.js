// @ts-check
/**
 * starting.wire.js — Câblage de la scène Démarrage (AD-6).
 */
import { onStateChange } from '../store.js';

/**
 * @param {import('../types.js').MountedScene} mounted
 * @returns {() => void} cleanup (désabonnement)
 */
export function wire(mounted) {
  const root = mounted.root;
  const subjectEl = root.querySelector('.starting-subject-text');
  // 'links' est géré déclarativement (TextList + $bind, voir starting.config.js, S8) — ce wire ne
  // câble plus que le sujet (fallback textuel non exprimable en binding pur, garde ce champ ici).

  return onStateChange((state) => {
    if (subjectEl) subjectEl.textContent = state.subjectLine || 'Au programme aujourd\'hui — surprise.';
  });
}
