// @ts-check
import { normalizeAlert } from './alert-event.js';

/**
 * dev/twitchat-adapter.js — Traduit un message envoyé par un trigger Twitchat (action « Websocket ») en alerte canonique.
 *
 * Twitchat se connecte, en client, à un serveur WebSocket que l'utilisateur indique, et ses triggers y envoient le JSON que
 * l'utilisateur écrit (`WebsocketTrigger.sendMessage`, dépôt Durss/Twitchat). Le format est donc **le nôtre** :
 *
 *   { "type": "follow", "username": "<pseudo>" }
 *   { "type": "sub",    "username": "<pseudo>" }
 *   { "type": "raid",   "username": "<pseudo>", "amount": <spectateurs> }
 *   { "type": "bits",   "username": "<pseudo>", "amount": <bits> }
 *
 * Twitchat remplace ses « placeholders » par des **textes** : un montant arrive donc le plus souvent comme `"25"`. Sont acceptés en
 * plus, pour éviter une erreur de saisie sans conséquence : la casse du type, quelques synonymes (`subscription`, `cheer`…), et
 * `user` / `login` / `displayName` pour le pseudo, `viewers` / `bits` / `count` pour le montant. Tout autre message est refusé avec
 * la raison, que le Studio affiche.
 */

/** @type {Readonly<Record<string, string>>} */
const TYPE_SYNONYMS = Object.freeze({
  followed: 'follow',
  subscription: 'sub',
  subscribe: 'sub',
  resub: 'sub',
  gift: 'sub',
  cheer: 'bits',
  bit: 'bits',
});

const USERNAME_KEYS = ['username', 'user', 'login', 'displayName', 'display_name', 'name'];
const AMOUNT_KEYS = ['amount', 'viewers', 'bits', 'count', 'total'];

/** @param {Record<string, unknown>} record @param {string[]} keys @returns {unknown} */
function firstPresent(record, keys) {
  for (const key of keys) if (record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key];
  return undefined;
}

/** @param {unknown} value @returns {number | undefined} */
function toAmount(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\s*\d+(?:[.,]\d+)?\s*$/.test(value)) return Number(value.replace(',', '.'));
  return undefined;
}

/**
 * @param {unknown} message le JSON déjà décodé
 * @returns {{ ok: true, alert: import('./alert-event.js').Alert } | { ok: false, error: string }}
 */
export function translateTwitchatMessage(message) {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) return { ok: false, error: 'message invalide (objet JSON attendu)' };
  const record = /** @type {Record<string, unknown>} */ (message);
  const rawType = typeof record.type === 'string' ? record.type.trim().toLowerCase() : record.type;
  const type = typeof rawType === 'string' ? (TYPE_SYNONYMS[rawType] ?? rawType) : rawType;
  const username = firstPresent(record, USERNAME_KEYS);
  const amount = toAmount(firstPresent(record, AMOUNT_KEYS));
  return normalizeAlert({ type, username: typeof username === 'string' ? username : undefined, amount });
}
