// @ts-check
/**
 * scenes/alert-gate.js — Garde anti-doublon pour `StreamState.latestAlert` (logique pure).
 *
 * `latestAlert` reste le même objet sur plusieurs notifications d'état tant qu'aucune nouvelle
 * alerte n'arrive ; sans garde, `AlertBanner.show()` se redéclencherait à chaque changement d'état
 * non lié à l'alerte. Ce pattern était copié-collé identique dans codage/discussion/jeu.wire.js
 * (review architecture, 2026-07-10) — extrait ici, une seule fois.
 */

/**
 * @returns {(alert: import('../types.js').StreamState['latestAlert']) => boolean} appelée à chaque
 *   changement d'état ; retourne `true` une seule fois par alerte (par `timestamp` unique).
 */
export function createAlertGate() {
  let lastTimestamp = 0;
  return (alert) => {
    if (!alert || alert.timestamp === lastTimestamp) return false;
    lastTimestamp = alert.timestamp;
    return true;
  };
}
