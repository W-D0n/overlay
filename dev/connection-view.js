// @ts-check
/**
 * dev/connection-view.js — Les phrases de la fenêtre Réglages (Twitchat, alertes reçues) et le modèle de message à coller dans Twitchat. Pur.
 */

/** @type {Readonly<Record<string, string>>} */
const SOURCE_LABELS = Object.freeze({ studio: 'Studio (test)', twitchat: 'Twitchat', twitch: 'Twitch' });
/** @type {Readonly<Record<string, string>>} */
const TYPE_LABELS = Object.freeze({ follow: 'Follow', sub: 'Sub', raid: 'Raid', bits: 'Bits' });

/**
 * « il y a 12 s », « il y a 3 min », « il y a 2 h ».
 * @param {string} iso
 * @param {number} now
 */
export function formatAgo(iso, now) {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `il y a ${seconds} s`;
  if (seconds < 3600) return `il y a ${Math.round(seconds / 60)} min`;
  return `il y a ${Math.round(seconds / 3600)} h`;
}

/**
 * @param {{ clients: number, lastAlertAt: string | null, lastError: string | null }} twitchat
 * @param {number} now
 * @returns {{ tone: 'ready' | 'attention', text: string }}
 */
export function describeTwitchat(twitchat, now) {
  /** @type {string[]} */
  const parts = [];
  if (twitchat.clients === 0) parts.push('En attente de Twitchat : aucune connexion pour l’instant.');
  else parts.push(twitchat.clients === 1 ? 'Twitchat est connecté.' : `${twitchat.clients} connexions de Twitchat.`);
  if (twitchat.lastAlertAt !== null) parts.push(`Dernière alerte : ${formatAgo(twitchat.lastAlertAt, now)}.`);
  if (twitchat.lastError !== null) parts.push(`Dernier problème : ${twitchat.lastError}.`);
  return { tone: twitchat.clients > 0 && twitchat.lastError === null ? 'ready' : 'attention', text: parts.join(' ') };
}

/**
 * @param {{ source: string, type: string, username?: string, amount?: number }} entry
 * @returns {string}
 */
export function describeAlert(entry) {
  const who = entry.username === undefined ? '' : ` ${entry.username}`;
  const amount = entry.amount === undefined ? '' : ` (${entry.amount})`;
  return `${TYPE_LABELS[entry.type] ?? entry.type}${who}${amount} — ${SOURCE_LABELS[entry.source] ?? entry.source}`;
}

/**
 * Le message à coller dans l'action « WebSocket » d'un trigger Twitchat. Les `{…}` sont des placeholders de Twitchat, remplacés au
 * moment de l'envoi. `token` est ajouté quand la case d'adresse de Twitchat ne peut pas porter le jeton.
 * @param {string} type
 * @param {string | null} token
 * @returns {string}
 */
export function twitchatSample(type, token) {
  /** @type {Record<string, string | number>} */
  const message = { type, username: '{USER}' };
  if (type === 'raid') message.amount = '{VIEWERS}';
  if (type === 'bits') message.amount = '{BITS}';
  if (token !== null) message.token = token;
  return JSON.stringify(message);
}
