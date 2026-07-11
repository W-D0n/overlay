// @ts-check
/**
 * codage.wire.js — Câblage des composants de la scène Codage (AD-6).
 */
import { onStateChange } from '../store.js';
import { createAlertGate } from './alert-gate.js';

/** Libellés courts par type d'alerte pour la bande basse sous la capture. */
const ALERT_STRIP_LABELS = { follow: '+ follow', sub: '+ sub', raid: 'raid', bits: 'bits' };

/**
 * @param {import('../types.js').MountedScene} mounted
 * @returns {() => void} cleanup (désabonnement + timer de la bande basse)
 */
export function wire(mounted) {
  const [pomodoro] = mounted.componentsByLayer.pomodoro;
  const [alert] = mounted.componentsByLayer.alert;
  const stripEl  = mounted.root.querySelector('.cod-alert-text');

  const isNewAlert = createAlertGate();
  /** @type {ReturnType<typeof setTimeout> | null} */
  let stripTimer = null;

  const unsubscribe = onStateChange((state) => {
    pomodoro.update?.(state.pomodoro);

    if (state.latestAlert && isNewAlert(state.latestAlert)) {
      alert.show?.(state.latestAlert);
      if (stripEl) {
        stripEl.textContent = `${ALERT_STRIP_LABELS[state.latestAlert.type] ?? ''} — ${state.latestAlert.username}`;
        if (stripTimer) clearTimeout(stripTimer);
        stripTimer = setTimeout(() => { stripEl.textContent = ''; }, 6000);
      }
    }
  });

  return () => {
    unsubscribe();
    if (stripTimer) clearTimeout(stripTimer);
  };
}
