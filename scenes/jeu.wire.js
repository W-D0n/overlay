// @ts-check
/**
 * jeu.wire.js — Câblage de la scène Jeu à l'état live (AD-6, migré S8).
 *
 * Session/durée restent des TextLabel adressés par `role` (pas de composant dédié justifié : aucun
 * style partagé avec d'autres scènes). Le vote (PollBar) et l'alerte (AlertBanner) sont des
 * `ComponentMount` déclaratifs (scenes/data/jeu.scene.json) : PollBar reçoit ses valeurs via `$bind`
 * (résolu automatiquement par `applyBindings`, scene-runtime.js — ce fichier n'a plus besoin de les
 * pousser à la main), et AlertBanner gère son propre minuteur d'auto-masquage en interne (fini le
 * `setTimeout`/`clearTimeout` dupliqué à la main, voir docs/inbox.md).
 *
 * Seule la visibilité du PollBar (masqué hors vote actif) reste gérée ici — `$bind` ne sait pas
 * exprimer "masquer si null" (voir docs/specs/scene-definition-v2.md).
 */
import { onStateChange } from '../store.js';
import { createAlertGate } from './alert-gate.js';

/**
 * @param {import('../types.js').MountedScene} mounted
 * @returns {() => void} cleanup (désabonnement)
 */
export function wire(mounted) {
  const { session, duration, poll, alert } = mounted.componentsByRole;

  const isNewAlert = createAlertGate();

  return onStateChange((state) => {
    session.el.textContent = `#${state.sessionId}`;
    duration.el.textContent = state.duration;

    poll.el.style.display = state.activePoll ? 'flex' : 'none';

    if (state.latestAlert && isNewAlert(state.latestAlert)) {
      alert.show?.(state.latestAlert);
    }
  });
}
wire.REQUIRED_ROLES = ['session', 'duration', 'poll', 'alert'];
