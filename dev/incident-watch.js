// @ts-check
/**
 * dev/incident-watch.js — Repérer qu'un incident vient d'arriver (ou de se terminer) à partir des lectures successives du bandeau « Antenne »
 * (`antenna-status.js`). Pur : les points lus en entrée, les incidents en sortie.
 *
 * Le bandeau montre l'état ; il ne **dit** rien quand l'état change, et le Studio n'est pas toujours sous les yeux (OBS est devant). Ici, on ne
 * parle que des **changements** : un point qui passait bien et qui passe mal est un incident, et son retour est un rétablissement. Rien n'est
 * annoncé au premier relevé (ce qui est déjà cassé à l'ouverture est dans le bandeau), ni pour un point qui n'est pas en jeu (OBS non configuré,
 * serveur éteint : les points qui en dépendent ne sont plus lus, ils ne sont pas « perdus » en plus). Un changement n'est retenu qu'après
 * `confirmations` relevés identiques de suite : un battement d'une seconde ne réveille personne.
 *
 * @typedef {import('./antenna-status.js').AntennaItem} AntennaItem
 * @typedef {{ id: 'server' | 'obs' | 'render', kind: 'lost' | 'recovered', message: string }} Incident
 */

/** Les points surveillés : ce dont dépend le fond à l'antenne. */
const WATCHED = /** @type {const} */ (['server', 'obs', 'render']);

/** @type {Record<'server' | 'obs' | 'render', { lost: (item: AntennaItem) => string, recovered: string }>} */
const MESSAGES = {
  server: {
    lost: () => 'Le serveur d’état ne répond plus : le Studio et l’antenne ne sont plus synchronisés.',
    recovered: 'Le serveur d’état répond de nouveau.',
  },
  obs: {
    lost: (item) => `OBS n’est plus joignable depuis le Studio (${item.detail}).`,
    recovered: 'OBS est de nouveau joignable.',
  },
  render: {
    lost: () => 'Plus aucune page de rendu : la source OBS n’affiche plus le fond (rafraîchir la source dans OBS).',
    recovered: 'Une page de rendu est de nouveau connectée.',
  },
};

/**
 * @param {{ confirmations?: number }} [options] relevés identiques de suite avant de retenir un changement (2 par défaut)
 */
export function createIncidentWatcher({ confirmations = 2 } = {}) {
  /** @type {Map<string, 'ok' | 'down' | 'off'>} */
  const stable = new Map();
  /** @type {Map<string, { state: 'ok' | 'down' | 'off', count: number }>} */
  const pending = new Map();

  return {
    /**
     * Un relevé du bandeau. Rend les incidents qu'il confirme.
     * @param {readonly AntennaItem[]} items
     * @returns {Incident[]}
     */
    observe(items) {
      /** @type {Incident[]} */
      const incidents = [];
      for (const id of WATCHED) {
        const item = items.find((candidate) => candidate.id === id);
        /** @type {'ok' | 'down' | 'off'} */
        const state = item === undefined || item.tone === 'off' ? 'off' : item.tone === 'ok' ? 'ok' : 'down';
        const known = stable.get(id);
        // Premier relevé, ou point qui n'est pas en jeu : on s'aligne sans rien dire.
        if (known === undefined || known === 'off' || state === 'off') {
          stable.set(id, state);
          pending.delete(id);
          continue;
        }
        if (state === known) {
          pending.delete(id);
          continue;
        }
        const seen = pending.get(id);
        // Seuls deux états se disputent (bon, perdu) : un relevé qui s'écarte de l'état retenu prolonge le précédent, un retour à l'état retenu l'efface.
        const count = (seen?.count ?? 0) + 1;
        if (count < confirmations) {
          pending.set(id, { state, count });
          continue;
        }
        pending.delete(id);
        stable.set(id, state);
        incidents.push({ id, kind: state === 'down' ? 'lost' : 'recovered', message: state === 'down' ? MESSAGES[id].lost(/** @type {AntennaItem} */ (item)) : MESSAGES[id].recovered });
      }
      return incidents;
    },
  };
}
