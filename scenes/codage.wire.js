// @ts-check
/**
 * codage.wire.js — Câblage des composants de la scène Codage (AD-6).
 */
import { onStateChange } from '../store.js';

/** Libellés courts par type d'alerte pour la bande basse sous la capture. */
const ALERT_STRIP_LABELS = { follow: '+ follow', sub: '+ sub', raid: 'raid', bits: 'bits' };

/**
 * @param {import('../types.js').MountedScene} mounted
 * @returns {() => void} cleanup (désabonnement + timer de la bande basse)
 */
export function wire(mounted) {
  const [statDuration] = mounted.componentsByLayer.stats;
  const [pomodoro] = mounted.componentsByLayer.pomodoro;
  const [alert] = mounted.componentsByLayer.alert;
  const fileEl   = mounted.root.querySelector('.file-name');
  const branchEl = mounted.root.querySelector('.git-branch');
  const stackEl  = mounted.root.querySelector('.stack-info');
  const stripEl  = mounted.root.querySelector('.cod-alert-text');

  let lastAlertTimestamp = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let stripTimer = null;

  const unsubscribe = onStateChange((state) => {
    statDuration.update?.({ value: state.duration });
    pomodoro.update?.(state.pomodoro);
    if (fileEl)   fileEl.textContent   = state.currentFile || '—';
    if (branchEl) branchEl.textContent = state.currentBranch || '';
    if (stackEl)  stackEl.textContent  = state.currentActivity || '';

    if (state.latestAlert && state.latestAlert.timestamp !== lastAlertTimestamp) {
      lastAlertTimestamp = state.latestAlert.timestamp;
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
