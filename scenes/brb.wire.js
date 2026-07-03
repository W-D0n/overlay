// @ts-check
/**
 * brb.wire.js — Câblage des composants de la scène BRB à l'état live (AD-6).
 * Les composants n'importent jamais `store.js` ; seul le wire le fait.
 */
import { onStateChange } from '../store.js';

/**
 * @param {import('../types.js').MountedScene} mounted
 * @returns {() => void} cleanup (désabonnement)
 */
export function wire(mounted) {
  const [statDuration] = mounted.componentsByLayer.stats;
  const [chat] = mounted.componentsByLayer.chat;
  const activityEl = mounted.root.querySelector('.brb-activity');
  const songEl     = mounted.root.querySelector('.brb-song');
  const nextEl     = mounted.root.querySelector('.next-info');
  const topicEl    = mounted.root.querySelector('.next-topic');

  return onStateChange((state) => {
    statDuration.update?.({ value: state.duration });
    chat.update?.(state.chatMessages);
    if (activityEl) activityEl.textContent = state.currentActivity ? `sur ${state.currentActivity}.` : "sur l'atelier.";
    if (songEl)     songEl.textContent     = state.currentSong || '—';
    if (nextEl)     nextEl.textContent     = state.nextStream || 'À venir';
    if (topicEl)    topicEl.textContent    = state.nextStreamTopic || '';
  });
}
