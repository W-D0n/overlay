// @ts-check
/**
 * react.wire.js — Câblage des composants de la scène React à des vidéos (AD-6).
 */
import { onStateChange } from '../store.js';

/**
 * @param {import('../types.js').MountedScene} mounted
 * @returns {() => void} cleanup (désabonnement)
 */
export function wire(mounted) {
  const { chat } = mounted.componentsByRole;
  const creditTitleEl = mounted.componentsByRole['credit-title'].el;
  const hudDurationEl = mounted.componentsByRole['hud-duration'].el;

  return onStateChange((state) => {
    chat.update?.(state.chatMessages);
    creditTitleEl.textContent = [state.sourceTitle, state.sourceAuthor].filter(Boolean).join(' · ') || '—';
    hudDurationEl.textContent = state.duration.slice(0, 5);
  });
}
wire.REQUIRED_ROLES = ['chat', 'credit-title', 'hud-duration'];
