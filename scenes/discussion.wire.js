// @ts-check
/**
 * discussion.wire.js — Câblage des composants de la scène Discussion (AD-6).
 */
import { onStateChange } from '../store.js';
import { createAlertGate } from './alert-gate.js';

/**
 * @param {import('../types.js').MountedScene} mounted
 * @returns {() => void} cleanup (désabonnement)
 */
export function wire(mounted) {
  const [chat] = mounted.componentsByLayer.chat;
  const [alert] = mounted.componentsByLayer.alert;
  const followEl  = mounted.root.querySelector('.last-follow-name');

  const isNewAlert = createAlertGate();

  return onStateChange((state) => {
    chat.update?.(state.chatMessages);
    if (followEl && state.latestAlert?.type === 'follow') followEl.textContent = state.latestAlert.username;
    if (state.latestAlert && isNewAlert(state.latestAlert)) {
      alert.show?.(state.latestAlert);
    }
  });
}
