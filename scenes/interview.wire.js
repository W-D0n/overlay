// @ts-check
/**
 * interview.wire.js — Câblage des composants de la scène Interview (AD-6).
 */
import { onStateChange } from '../store.js';

/**
 * @param {import('../types.js').MountedScene} mounted
 * @returns {() => void} cleanup (désabonnement)
 */
export function wire(mounted) {
  const [chat] = mounted.componentsByLayer.chat;
  const [statDuration] = mounted.componentsByLayer.stats;
  const guestNameEl = mounted.root.querySelector('.fiche-name-guest');
  const guestRoleEl = mounted.root.querySelector('.fiche-role-guest');
  const subjectEl   = mounted.root.querySelector('.subject-text');

  return onStateChange((state) => {
    chat.update?.(state.chatMessages);
    statDuration.update?.({ value: state.duration });
    if (guestNameEl) guestNameEl.textContent = state.guest?.name || 'Invité';
    if (guestRoleEl) guestRoleEl.textContent = state.guest?.role || '—';
    if (subjectEl)   subjectEl.textContent   = state.subjectLine || '—';
  });
}
