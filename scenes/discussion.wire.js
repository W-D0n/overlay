// @ts-check
/**
 * discussion.wire.js — Câblage des composants de la scène Discussion (AD-6).
 */
import { onStateChange } from '../store.js';

/**
 * @param {import('../types.js').MountedScene} mounted
 * @returns {() => void} cleanup (désabonnement)
 */
export function wire(mounted) {
  const [statViewers, statDuration] = mounted.componentsByLayer.stats;
  const [chat] = mounted.componentsByLayer.chat;
  const [alert] = mounted.componentsByLayer.alert;
  const subjectEl = mounted.root.querySelector('.subject-text');
  const followEl  = mounted.root.querySelector('.last-follow-name');

  let lastAlertTimestamp = 0;

  return onStateChange((state) => {
    statViewers.update?.({ value: state.viewers > 0 ? state.viewers.toLocaleString('fr-FR') : '—' });
    statDuration.update?.({ value: state.duration });
    chat.update?.(state.chatMessages);
    if (subjectEl) subjectEl.textContent = state.subjectLine || 'En attente';
    if (followEl && state.latestAlert?.type === 'follow') followEl.textContent = state.latestAlert.username;
    if (state.latestAlert && state.latestAlert.timestamp !== lastAlertTimestamp) {
      lastAlertTimestamp = state.latestAlert.timestamp;
      alert.show?.(state.latestAlert);
    }
  });
}
