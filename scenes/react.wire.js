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
  const [chat] = mounted.componentsByLayer.chat;
  const creditTitleEl    = mounted.root.querySelector('.react-credit-title');
  const creditPlatformEl = mounted.root.querySelector('.react-credit-platform');
  const hudViewersEl     = mounted.root.querySelector('.react-hud-viewers');
  const hudDurationEl    = mounted.root.querySelector('.react-hud-duration');

  return onStateChange((state) => {
    chat.update?.(state.chatMessages);
    if (creditTitleEl)    creditTitleEl.textContent    = [state.sourceTitle, state.sourceAuthor].filter(Boolean).join(' · ') || '—';
    if (creditPlatformEl) creditPlatformEl.textContent = state.sourcePlatform || '';
    if (hudViewersEl)     hudViewersEl.textContent      = state.viewers > 0 ? state.viewers.toLocaleString('fr-FR') : '—';
    if (hudDurationEl)    hudDurationEl.textContent      = state.duration.slice(0, 5);
  });
}
