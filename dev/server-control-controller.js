// @ts-check
import { controlFailure, controlPrompt } from './server-control.js';

const RECONNECT_POLL_MS = 1000;
const RECONNECT_MAX_TRIES = 30;

/**
 * Menu « Serveurs » : Redémarrer / Arrêter, avec confirmation. Les décisions de texte sont dans
 * `server-control.js` ; ce module peint le DOM et relaie la demande.
 *
 * @param {{
 *   root: HTMLElement,
 *   toggle: HTMLButtonElement,
 *   panel: HTMLElement,
 *   status: HTMLElement,
 *   client: {
 *     control(action: 'restart' | 'stop'): Promise<unknown>,
 *     readObsStatus(): Promise<unknown>,
 *   },
 *   getRenderPages: () => number | null,
 *   documentRef?: Document,
 *   windowRef?: Window,
 * }} input
 */
export function createServerControlController(input) {
  const documentRef = input.documentRef ?? document;
  const windowRef = input.windowRef ?? window;

  function closePanel() {
    input.panel.hidden = true;
    input.toggle.setAttribute('aria-expanded', 'false');
  }

  /** @param {string} message */
  function say(message) {
    input.status.textContent = message;
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
    say(action === 'restart' ? 'Redémarrage en cours…' : 'Arrêt en cours…');
    try {
      await input.client.control(action);
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'status' in error
        ? /** @type {{ status: number | null }} */ (error).status
        : null;
      say(controlFailure(status));
      return;
    }
    if (action === 'stop') {
      say('Serveurs arrêtés. Pour les relancer : start-stream.bat.');
      return;
    }
    say((await waitForServer()) ? 'Serveurs redémarrés.' : 'Le serveur n’est pas revenu : relance start-stream.bat.');
    windowRef.location.reload();
  }

  /** @param {'restart' | 'stop'} action */
  function ask(action) {
    const prompt = controlPrompt(action, input.getRenderPages());
    input.status.replaceChildren();
    const title = documentRef.createElement('strong');
    title.textContent = prompt.title;
    input.status.appendChild(title);
    if (prompt.warning !== null) {
      const warning = documentRef.createElement('p');
      warning.textContent = prompt.warning;
      input.status.appendChild(warning);
    }
    const confirm = documentRef.createElement('button');
    confirm.type = 'button';
    confirm.textContent = prompt.confirmLabel;
    confirm.onclick = () => { confirm.disabled = true; run(action); };
    const cancel = documentRef.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Annuler';
    cancel.onclick = () => { input.status.replaceChildren(); closePanel(); };
    input.status.append(confirm, cancel);
  }

  input.toggle.onclick = () => {
    const opening = input.panel.hidden;
    input.panel.hidden = !opening;
    input.toggle.setAttribute('aria-expanded', String(opening));
    if (opening) input.status.replaceChildren();
  };
  for (const button of input.panel.querySelectorAll('[data-control]')) {
    button.addEventListener('click', () => {
      const action = button.getAttribute('data-control');
      if (action === 'restart' || action === 'stop') ask(action);
    });
  }

  return { closePanel };
}
