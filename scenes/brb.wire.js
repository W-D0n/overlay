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
  const { chat, activity } = mounted.componentsByRole;

  return onStateChange((state) => {
    chat.update?.(state.chatMessages);
    activity.el.textContent = state.currentActivity ? `sur ${state.currentActivity}.` : "sur l'atelier.";
  });
}
wire.REQUIRED_ROLES = ['chat', 'activity'];
