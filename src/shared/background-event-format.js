// @ts-check
/**
 * background-event-format.js — Validation pure d'un événement de réaction (2026-07-24).
 *
 * Corps de `POST /event` du serveur d'état. Réutilise la forme `AlertEvent` (types.js) : seul `type`
 * est requis, les autres champs sont transmis tels quels et ignorés par les réactions visuelles.
 * Voir docs/specs/background-reactive-events.md.
 */

/** @type {readonly string[]} */
export const VALID_EVENT_TYPES = ['follow', 'sub', 'raid', 'bits'];

/**
 * @param {unknown} body
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateBackgroundEvent(body) {
  /** @type {string[]} */
  const errors = [];
  if (typeof body !== 'object' || body === null) {
    return { ok: false, errors: ['corps d’événement invalide (objet attendu)'] };
  }
  const type = /** @type {Record<string, unknown>} */ (body).type;
  if (typeof type !== 'string' || type.length === 0) {
    errors.push('type d’événement manquant');
  } else if (!VALID_EVENT_TYPES.includes(type)) {
    errors.push(`type d’événement inconnu : ${type}`);
  }
  return { ok: errors.length === 0, errors };
}
