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
  const linksEl    = root.querySelector('.starting-links-list');

  return onStateChange((state) => {
    if (subjectEl) subjectEl.textContent = state.subjectLine || 'Au programme aujourd\'hui — surprise.';

    if (linksEl && state.socialLinks.length > 0) {
      linksEl.innerHTML = '';
      state.socialLinks.forEach((link, i) => {
        const div = document.createElement('div');
        div.className = `starting-link-item${i > 0 ? ' dim' : ''}`;
        div.textContent = link;
        linksEl.appendChild(div);
      });
    }
  });
}
