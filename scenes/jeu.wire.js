// @ts-check
/**
 * jeu.wire.js — Câblage de la scène Jeu à l'état live (AD-6).
 * HUD bas DOM-pur (aucun composant monté hors goldbar) : tout est câblé par querySelector.
 * L'alerte utilise un fondu local piloté par un timer, annulé au démontage (AC-39).
 */
import { onStateChange } from '../store.js';

/** Libellés courts par type d'alerte, affichés dans la cellule HUD. */
const ALERT_LABELS = { follow: '+ follow', sub: '+ sub', raid: 'raid', bits: 'bits' };

/** Durée d'affichage de l'alerte dans le HUD (ms). */
const ALERT_DISPLAY_DURATION = 5000;

/**
 * @param {import('../types.js').MountedScene} mounted
 * @returns {() => void} cleanup (désabonnement + annulation du timer d'alerte)
 */
export function wire(mounted) {
  const root = mounted.root;
  const sessionEl  = root.querySelector('.jeu-session');
  const durationEl = root.querySelector('.jeu-duration');
  const pollCell        = /** @type {HTMLElement | null} */ (root.querySelector('.jeu-poll-cell'));
  const pollQuestionEl  = root.querySelector('.jeu-poll-question');
  const pollFillEl      = /** @type {HTMLElement | null} */ (root.querySelector('.jeu-poll-fill'));
  const pollRatioEl     = root.querySelector('.jeu-poll-ratio');
  const alertCell       = /** @type {HTMLElement | null} */ (root.querySelector('.jeu-alert-cell'));
  const alertLabelEl    = root.querySelector('.jeu-alert-label');
  const alertUsernameEl = root.querySelector('.jeu-alert-username');

  let lastAlertTimestamp = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let alertHideTimer = null;

  const unsubscribe = onStateChange((state) => {
    if (sessionEl)  sessionEl.textContent  = `#${state.sessionId}`;
    if (durationEl) durationEl.textContent = state.duration;

    if (pollCell) {
      if (state.activePoll) {
        const percent = Math.round(state.activePoll.yesRatio * 100);
        pollCell.style.display = 'flex';
        if (pollQuestionEl) pollQuestionEl.textContent = state.activePoll.question;
        if (pollFillEl)     pollFillEl.style.width     = `${percent}%`;
        if (pollRatioEl)    pollRatioEl.textContent    = `${percent}% oui`;
      } else {
        pollCell.style.display = 'none';
      }
    }

    if (state.latestAlert && state.latestAlert.timestamp !== lastAlertTimestamp) {
      lastAlertTimestamp = state.latestAlert.timestamp;
      if (alertLabelEl)    alertLabelEl.textContent    = ALERT_LABELS[state.latestAlert.type] ?? 'alerte';
      if (alertUsernameEl) alertUsernameEl.textContent = state.latestAlert.username;
      if (alertCell) {
        alertCell.style.opacity = '1';
        if (alertHideTimer) clearTimeout(alertHideTimer);
        alertHideTimer = setTimeout(() => { alertCell.style.opacity = '0'; }, ALERT_DISPLAY_DURATION);
      }
    }
  });

  return () => {
    if (alertHideTimer) clearTimeout(alertHideTimer);
    unsubscribe();
  };
}
