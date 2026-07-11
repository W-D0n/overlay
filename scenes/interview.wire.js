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

  return onStateChange((state) => {
    chat.update?.(state.chatMessages);
  });
}
