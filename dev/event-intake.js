// @ts-check
/**
 * dev/event-intake.js — Le point d'entrée unique des alertes : le bouton de test du Studio, Twitchat et Twitch EventSub arrivent ici.
 *
 * `publish` diffuse l'alerte sur le canal `event` (les pages de rendu réagissent) et la range dans le **journal** que le Studio montre
 * (« dernières alertes reçues » : on y voit qu'une source marche, et laquelle). Un **limiteur** protège le live : au-delà de
 * `burst` alertes sur `windowMs`, les suivantes sont refusées et comptées — un trigger qui boucle ne noie pas le rendu d'OBS.
 * Rien n'est persisté : le journal vit tant que le serveur tourne.
 *
 * @typedef {'studio' | 'twitchat' | 'twitch'} AlertSource
 * @typedef {{ at: string, source: AlertSource, type: string, username?: string, amount?: number }} JournalEntry
 *
 * @param {{
 *   channels: ReturnType<typeof import('./channels.js').createChannels>,
 *   now?: () => number,
 *   capacity?: number,
 *   burst?: number,
 *   windowMs?: number,
 * }} deps
 */
export function createEventIntake({ channels, now = Date.now, capacity = 20, burst = 20, windowMs = 5000 }) {
  /** @type {JournalEntry[]} */
  const journal = [];
  /** @type {number[]} */
  let recent = [];
  let refused = 0;

  return {
    /**
     * @param {{ type: string, username?: string, amount?: number }} event une alerte déjà validée
     * @param {AlertSource} source
     * @param {unknown} [payload] ce qui part vers les pages de rendu (l'alerte elle-même par défaut)
     * @returns {{ ok: true } | { ok: false, error: string }}
     */
    publish(event, source, payload = event) {
      const at = now();
      recent = recent.filter((time) => at - time < windowMs);
      if (recent.length >= burst) {
        refused += 1;
        return { ok: false, error: `trop d’alertes (${burst} en ${windowMs / 1000} s) : celle-ci est ignorée` };
      }
      recent.push(at);
      channels.broadcast('event', payload);
      /** @type {JournalEntry} */
      const entry = { at: new Date(at).toISOString(), source, type: event.type };
      if (event.username !== undefined) entry.username = event.username;
      if (event.amount !== undefined) entry.amount = event.amount;
      journal.unshift(entry);
      if (journal.length > capacity) journal.length = capacity;
      return { ok: true };
    },

    /** Les dernières alertes, la plus récente d'abord. @returns {JournalEntry[]} */
    recent: () => journal.slice(),

    /** Alertes refusées par le limiteur depuis le départ. */
    get refused() { return refused; },
  };
}
