// @ts-check
/**
 * fin.wire.js — Câblage des composants de la scène Fin de stream (AD-6).
 */
import { onStateChange } from '../store.js';

/**
 * @param {import('../types.js').MountedScene} mounted
 * @returns {() => void} cleanup (désabonnement)
 */
export function wire(mounted) {
  const [statMaxViewers, statNewFollows, statDuration] = mounted.componentsByLayer.stats;
  const root = mounted.root;
  const recapEl     = root.querySelector('.fin-recap-lines');
  const nextWhenEl  = root.querySelector('.fin-next-when');
  const nextTopicEl = root.querySelector('.fin-next-topic');
  const linksEl     = root.querySelector('.fin-links-list');

  return onStateChange((state) => {
    statMaxViewers.update?.({ value: state.sessionStats.maxViewers > 0 ? state.sessionStats.maxViewers.toLocaleString('fr-FR') : '—' });
    statNewFollows.update?.({ value: state.sessionStats.newFollows > 0 ? `+${state.sessionStats.newFollows}` : '—' });
    statDuration.update?.({ value: state.sessionStats.duration || '00:00:00' });

    if (nextWhenEl)  nextWhenEl.textContent  = state.nextStream || 'À venir';
    if (nextTopicEl) nextTopicEl.textContent = state.nextStreamTopic || '';

    if (recapEl && state.recapLines.length > 0) {
      recapEl.innerHTML = '';
      state.recapLines.forEach((line, i) => {
        const div = document.createElement('div');
        div.className = `fin-recap-line${i > 0 ? ' dim' : ''}`;
        div.textContent = line;
        recapEl.appendChild(div);
      });
    }

    if (linksEl && state.socialLinks.length > 0) {
      linksEl.innerHTML = '';
      state.socialLinks.forEach((link, i) => {
        const div = document.createElement('div');
        div.className = `fin-link-item${i > 0 ? ' dim' : ''}`;
        div.textContent = link;
        linksEl.appendChild(div);
      });
    }
  });
}
