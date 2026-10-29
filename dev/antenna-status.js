// @ts-check
/**
 * dev/antenna-status.js — Ce que le bandeau « Antenne » du Studio doit afficher.
 *
 * Logique pure : chaque point répond à une seule question (le serveur répond-il ? OBS est-il lu ?
 * une page de rendu affiche-t-elle le fond ? le micro est-il lu ?) à partir de lectures déjà faites.
 *
 * @typedef {'ok' | 'warn' | 'bad' | 'off'} AntennaTone
 * @typedef {{ id: 'server' | 'obs' | 'render' | 'audio', label: string, tone: AntennaTone, detail: string }} AntennaItem
 * @typedef {{ connected: boolean, configured: boolean, reason: string | null, activeScene?: string | null }} AntennaObsStatus
 */

/**
 * @param {{
 *   serverReachable: boolean,
 *   obs: AntennaObsStatus | null,
 *   renderPages: number | null,
 *   audio: { status: 'idle' | 'active' | 'unavailable', reason: string | null } | null,
 * }} input
 * @returns {AntennaItem[]}
 */
export function antennaItems({ serverReachable, obs, renderPages, audio }) {
  /** @type {AntennaItem[]} */
  const items = [{
    id: 'server',
    label: 'Serveur d’état',
    tone: serverReachable ? 'ok' : 'bad',
    detail: serverReachable ? 'connecté' : 'injoignable — lancer start-stream',
  }];
  if (!serverReachable) return items;

  items.push({ id: 'obs', label: 'OBS', ...obsReading(obs) });
  items.push({ id: 'render', label: 'Page de rendu', ...renderReading(renderPages) });
  if (audio !== null) items.push({ id: 'audio', label: 'Micro', ...audioReading(audio) });
  return items;
}

/** @param {AntennaObsStatus | null} obs @returns {{ tone: AntennaTone, detail: string }} */
function obsReading(obs) {
  if (obs === null || !obs.configured) return { tone: 'off', detail: 'non configuré (OBS_WS_PASSWORD dans .env)' };
  if (obs.connected) {
    return { tone: 'ok', detail: obs.activeScene ? `connecté · scène « ${obs.activeScene} »` : 'connecté' };
  }
  if (obs.reason === 'auth-rejected') return { tone: 'bad', detail: 'mot de passe refusé' };
  return { tone: 'warn', detail: 'injoignable — OBS est-il ouvert ?' };
}

/** @param {number | null} renderPages @returns {{ tone: AntennaTone, detail: string }} */
function renderReading(renderPages) {
  if (renderPages === null) return { tone: 'off', detail: 'indisponible — relancer le serveur d’état' };
  if (renderPages === 0) return { tone: 'warn', detail: 'aucune page connectée — rafraîchir la source dans OBS' };
  return { tone: 'ok', detail: renderPages === 1 ? '1 page connectée' : `${renderPages} pages connectées` };
}

/**
 * @param {{ status: 'idle' | 'active' | 'unavailable', reason: string | null }} audio
 * @returns {{ tone: AntennaTone, detail: string }}
 */
function audioReading(audio) {
  if (audio.status === 'active') return { tone: 'ok', detail: 'lu par l’aperçu' };
  if (audio.status === 'unavailable') return { tone: 'warn', detail: audio.reason ?? 'indisponible' };
  return { tone: 'off', detail: 'en attente d’autorisation' };
}

/**
 * Pire état des points ; un point « off » (non configuré, indisponible) ne dégrade pas l'ensemble.
 * @param {AntennaItem[]} items
 * @returns {{ tone: 'ok' | 'warn' | 'bad', text: string }}
 */
export function antennaSummary(items) {
  if (items.some(({ tone }) => tone === 'bad')) return { tone: 'bad', text: 'À corriger' };
  if (items.some(({ tone }) => tone === 'warn')) return { tone: 'warn', text: 'À vérifier' };
  return { tone: 'ok', text: 'Prêt' };
}
