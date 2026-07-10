// @ts-check
/**
 * jeu.wire.js — Câblage de la scène Jeu à l'état live (AD-6, migré S8).
 *
 * Session/durée restent en DOM pur (querySelector) — simples spans, pas de composant dédié
 * justifié (aucun style partagé avec d'autres scènes). Le vote (PollBar) et l'alerte (AlertBanner)
 * sont désormais des `ComponentMount` déclaratifs (scenes/data/jeu.scene.json) : PollBar reçoit ses
 * valeurs via `$bind` (résolu automatiquement par `applyBindings`, scene-runtime.js — ce fichier n'a
 * plus besoin de les pousser à la main), et AlertBanner gère son propre minuteur d'auto-masquage en
 * interne (fini le `setTimeout`/`clearTimeout` dupliqué à la main, voir docs/inbox.md).
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
  const root = mounted.root;
  const sessionEl  = root.querySelector('.jeu-session');
  const durationEl = root.querySelector('.jeu-duration');
  const [pollBar]     = mounted.componentsByLayer.hud;
  const [alertBanner] = mounted.componentsByLayer.alert;

  const isNewAlert = createAlertGate();

  return onStateChange((state) => {
    if (sessionEl)  sessionEl.textContent  = `#${state.sessionId}`;
    if (durationEl) durationEl.textContent = state.duration;

    if (pollBar) pollBar.el.style.display = state.activePoll ? 'flex' : 'none';

    if (state.latestAlert && isNewAlert(state.latestAlert)) {
      alertBanner?.show?.(state.latestAlert);
    }
  });
}
