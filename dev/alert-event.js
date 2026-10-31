// @ts-check
import { VALID_EVENT_TYPES } from './background-event-format.js';

/**
 * dev/alert-event.js — L'alerte canonique `{ type, username?, amount? }` (le contrat des réactions, `CLAUDE.md` §6), pure.
 *
 * Toute source d'alertes qui n'est pas le Studio (Twitchat, Twitch EventSub) passe par `normalizeAlert` : ce qu'elle envoie est nettoyé
 * (pseudo borné et sans caractère de contrôle, montant entier et borné) avant d'atteindre les pages de rendu. Les champs inconnus
 * sont écartés : une source ne fait jamais passer autre chose que ces trois champs jusqu'à OBS.
 *
 * @typedef {{ type: 'follow' | 'sub' | 'raid' | 'bits', username?: string, amount?: number }} Alert
 */

export const MAX_USERNAME_LENGTH = 60;
export const MAX_AMOUNT = 1_000_000_000;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

/**
 * @param {unknown} input
 * @returns {{ ok: true, alert: Alert } | { ok: false, error: string }}
 */
export function normalizeAlert(input) {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'alerte invalide (objet attendu)' };
  const record = /** @type {Record<string, unknown>} */ (input);
  const type = record.type;
  if (typeof type !== 'string' || !VALID_EVENT_TYPES.includes(type)) {
    return { ok: false, error: `type d’alerte inconnu : ${typeof type === 'string' ? type : '(absent)'} — attendu : ${VALID_EVENT_TYPES.join(', ')}` };
  }
  /** @type {Alert} */
  const alert = { type: /** @type {Alert['type']} */ (type) };

  if (typeof record.username === 'string') {
    const username = record.username.replace(CONTROL_CHARACTERS, '').trim().slice(0, MAX_USERNAME_LENGTH);
    if (username !== '') alert.username = username;
  }

  if (typeof record.amount === 'number' && Number.isFinite(record.amount) && record.amount >= 0) {
    alert.amount = Math.min(Math.trunc(record.amount), MAX_AMOUNT);
  }
  return { ok: true, alert };
}
