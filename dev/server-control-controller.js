// @ts-check
import { controlFailure } from './server-control.js';

const RECONNECT_POLL_MS = 1000;
const RECONNECT_MAX_TRIES = 30;

/**
 * Boutons « Redémarrer » et « Arrêter » de la barre du Studio : un clic agit, sans menu ni confirmation. Les messages
 * d'échec sont dans `server-control.js` ; ce module relaie la demande et dit où elle en est.
 *
 * @param {{
 *   root: HTMLElement,
 *   status: HTMLElement,
 *   client: {
 *     control(action: 'restart' | 'stop'): Promise<unknown>,
 *     readObsStatus(): Promise<unknown>,
 *   },
 *   windowRef?: Window,
 * }} input
 */
export function createServerControlController(input) {
  const windowRef = input.windowRef ?? window;
  const buttons = /** @type {HTMLButtonElement[]} */ ([...input.root.querySelectorAll('[data-control]')]);

  /** @param {string} message @param {boolean} [failed] */
  function say(message, failed = false) {
    input.status.textContent = message;
    input.status.dataset.tone = failed ? 'bad' : 'info';
  }

  /** @param {boolean} busy */
  function setBusy(busy) {
    for (const button of buttons) button.disabled = busy;
  }

  async function waitForServer() {
    for (let attempt = 0; attempt < RECONNECT_MAX_TRIES; attempt += 1) {
      await new Promise((resolve) => windowRef.setTimeout(resolve, RECONNECT_POLL_MS));
      try {
        await input.client.readObsStatus();
        return true;
      } catch {
        // Le serveur n'est pas encore revenu.
      }
    }
    return false;
  }

  /** @param {'restart' | 'stop'} action */
  async function run(action) {
    setBusy(true);
    say(action === 'restart' ? 'Redémarrage en cours…' : 'Arrêt en cours…');
    try {
      await input.client.control(action);
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'status' in error
        ? /** @type {{ status: number | null }} */ (error).status
        : null;
      say(controlFailure(status, error instanceof Error ? error.message : String(error)), true);
      setBusy(false);
      return;
    }
    if (action === 'stop') {
      say('Serveurs arrêtés. Pour les relancer : start-stream.bat ou l’application.');
      return;
    }
    if (!(await waitForServer())) {
      say('Le serveur n’est pas revenu : relance start-stream.bat.', true);
      setBusy(false);
      return;
    }
    windowRef.location.reload();
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const action = button.getAttribute('data-control');
      if (action === 'restart' || action === 'stop') run(action);
    });
  }

  return { run };
}
