// @ts-check
/**
 * ui/panel-state.js — Ce que le panneau de contrôle affiche et autorise, selon l'état des serveurs.
 *
 * Pur : l'état vient de la commande `servers_status` de l'application (src/main.rs). Les trois boutons sont
 * indépendants : chacun est actif quand son geste a un sens, et dit pourquoi il ne l'est pas sinon.
 *
 * @typedef {{ bun: string | null, staticPort: number, statePort: number, staticUp: boolean, stateUp: boolean, stateAnswers: boolean, busy: boolean, notice: string | null }} ServersStatus
 * @typedef {'stopped' | 'running' | 'partial' | 'foreign'} Phase
 * @typedef {{ disabled: boolean, reason: string }} ButtonState
 */

/**
 * @param {ServersStatus} status
 * @returns {Phase}
 */
export function phaseOf(status) {
  if (!status.staticUp && !status.stateUp) return 'stopped';
  if (status.staticUp && status.stateUp) return status.stateAnswers ? 'running' : 'foreign';
  return 'partial';
}

/**
 * @param {ServersStatus} status
 * @returns {{ phase: Phase, tone: 'ok' | 'off' | 'bad', headline: string, detail: string }}
 */
export function describeServers(status) {
  const phase = phaseOf(status);
  if (status.busy) return { phase, tone: 'off', headline: 'Opération en cours…', detail: '' };
  if (phase === 'running') return { phase, tone: 'ok', headline: 'Serveurs en marche', detail: '' };
  if (phase === 'stopped') {
    return {
      phase,
      tone: 'off',
      headline: 'Serveurs arrêtés',
      detail: status.bun === null ? 'Bun est introuvable : installe-le depuis https://bun.sh puis relance l’application.' : '',
    };
  }
  if (phase === 'partial') {
    return { phase, tone: 'bad', headline: 'Un seul serveur répond', detail: 'Un serveur est tombé, ou un autre programme tient un des deux ports. Redémarrer libère les ports du projet, jamais ceux d’un autre programme.' };
  }
  return { phase, tone: 'bad', headline: 'Ports occupés par un autre programme', detail: `Les ports ${status.staticPort} et ${status.statePort} ne répondent pas comme les serveurs du projet. Ferme ce programme (Gestionnaire des tâches), puis démarre.` };
}

/**
 * @param {ServersStatus} status
 * @param {boolean} busy une action est en cours
 * @returns {{ start: ButtonState, restart: ButtonState, stop: ButtonState, studio: ButtonState }}
 */
export function buttonStates(status, busy) {
  busy = busy || status.busy;
  const phase = phaseOf(status);
  /** @param {boolean} allowed @param {string} reason */
  const button = (allowed, reason) => ({ disabled: busy || !allowed, reason: busy ? 'Action en cours…' : (allowed ? '' : reason) });
  return {
    start: button(phase === 'stopped' && status.bun !== null, phase === 'stopped' ? 'Bun est introuvable.' : 'Les serveurs tournent déjà, ou un port est occupé.'),
    restart: button(phase === 'running' || phase === 'partial', 'Aucun serveur du projet à redémarrer.'),
    stop: button(phase === 'running' || phase === 'partial', 'Aucun serveur du projet à arrêter.'),
    studio: button(phase === 'running', 'Les serveurs doivent être en marche.'),
  };
}
