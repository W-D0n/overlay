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
  const [statNewFollows, statDuration] = mounted.componentsByLayer.stats;
  const root = mounted.root;
  const nextWhenEl  = root.querySelector('.fin-next-when');
  const nextTopicEl = root.querySelector('.fin-next-topic');
  // 'recap' et 'links' sont gérés déclarativement (TextList + $bind, voir fin.config.js, S8).

  return onStateChange((state) => {
    statNewFollows.update?.({ value: state.sessionStats.newFollows > 0 ? `+${state.sessionStats.newFollows}` : '—' });
    statDuration.update?.({ value: state.sessionStats.duration || '00:00:00' });

    if (nextWhenEl)  nextWhenEl.textContent  = state.nextStream || 'À venir';
    if (nextTopicEl) nextTopicEl.textContent = state.nextStreamTopic || '';
  });
}
