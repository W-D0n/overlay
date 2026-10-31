// @ts-check
import { normalizeAlert } from './alert-event.js';

/**
 * dev/twitch-alerts.js — Traduit une notification EventSub de Twitch en alerte canonique `{ type, username?, amount? }`. Pur.
 *
 * | Notification Twitch                | Alerte                                                                  |
 * | `channel.follow`                   | `follow`, pseudo du nouveau follower                                    |
 * | `channel.subscribe`                | `sub`, pseudo — **sauf un abonnement offert** (voir ci-dessous)         |
 * | `channel.subscription.message`     | `sub`, pseudo, montant = nombre de mois cumulés (ré-abonnement)         |
 * | `channel.subscription.gift`        | `sub`, pseudo du donateur (« Anonyme » si masqué), montant = nombre offert |
 * | `channel.cheer`                    | `bits`, pseudo (aucun si anonyme), montant = bits                       |
 * | `channel.raid`                     | `raid`, pseudo du streamer qui raide, montant = spectateurs             |
 *
 * Un abonnement offert déclenche **deux** notifications chez Twitch : `channel.subscription.gift` (une, pour le donateur) et un
 * `channel.subscribe` avec `is_gift` pour **chaque** bénéficiaire. Ne garder que la première évite vingt alertes pour vingt abonnements
 * offerts d'un coup. Un nouvel abonnement n'envoie jamais `channel.subscription.message` (réservé au ré-abonnement) : pas de doublon.
 *
 * @param {string} subscriptionType
 * @param {unknown} event
 * @returns {import('./alert-event.js').Alert | null} `null` : notification connue mais sans alerte (abonnement offert reçu), ou inconnue
 */
export function alertFromNotification(subscriptionType, event) {
  if (typeof event !== 'object' || event === null) return null;
  const record = /** @type {Record<string, unknown>} */ (event);
  /** @type {unknown} */
  let candidate = null;
  switch (subscriptionType) {
    case 'channel.follow':
      candidate = { type: 'follow', username: record.user_name };
      break;
    case 'channel.subscribe':
      if (record.is_gift === true) return null;
      candidate = { type: 'sub', username: record.user_name };
      break;
    case 'channel.subscription.message':
      candidate = { type: 'sub', username: record.user_name, amount: record.cumulative_months };
      break;
    case 'channel.subscription.gift':
      candidate = { type: 'sub', username: record.is_anonymous === true ? 'Anonyme' : record.user_name, amount: record.total };
      break;
    case 'channel.cheer':
      candidate = { type: 'bits', username: record.is_anonymous === true ? undefined : record.user_name, amount: record.bits };
      break;
    case 'channel.raid':
      candidate = { type: 'raid', username: record.from_broadcaster_user_name, amount: record.viewers };
      break;
    default:
      return null;
  }
  const normalized = normalizeAlert(candidate);
  return normalized.ok ? normalized.alert : null;
}

/**
 * Les abonnements à créer pour une chaîne (`userId` : le compte autorisé, qui est aussi la chaîne suivie).
 * @param {string} userId
 * @returns {{ type: string, version: string, condition: Record<string, string> }[]}
 */
export function subscriptionsFor(userId) {
  return [
    { type: 'channel.follow', version: '2', condition: { broadcaster_user_id: userId, moderator_user_id: userId } },
    { type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: userId } },
    { type: 'channel.subscription.message', version: '1', condition: { broadcaster_user_id: userId } },
    { type: 'channel.subscription.gift', version: '1', condition: { broadcaster_user_id: userId } },
    { type: 'channel.cheer', version: '1', condition: { broadcaster_user_id: userId } },
    { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: userId } },
  ];
}
