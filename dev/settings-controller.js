// @ts-check
import { errorMessage } from './error-message.js';
import { obsStatusMessage } from './obs-scene-map-presenter.js';

/** Au rythme d'un coup d'œil : la fenêtre ouverte suit la connexion (« en cours » → « connecté » ou « refusé »). */
export const SETTINGS_POLL_MS = 1000;

/**
 * dev/settings-controller.js — La fenêtre « Réglages » du Studio : la connexion à OBS (adresse, mot de passe).
 *
 * Le mot de passe est saisi dans un champ masqué dont un bouton **Afficher / Masquer** bascule les caractères. Seule la **saisie en cours**
 * peut s'afficher : le serveur ne renvoie jamais un mot de passe déjà enregistré (il dit seulement qu'il y en a un), et la fenêtre
 * ne le garde pas — le champ est vidé et remasqué à l'enregistrement et à la fermeture. Laisser le champ vide conserve le mot de passe
 * enregistré. Enregistrer reconnecte OBS aussitôt, sans relancer les serveurs ; la fenêtre ouverte relit l'état de la connexion chaque seconde.
 *
 * @param {{
 *   elements: {
 *     dialog: HTMLDialogElement,
 *     close: HTMLButtonElement,
 *     status: HTMLElement,
 *     obsStatus: HTMLElement,
 *     obsUrl: HTMLInputElement,
 *     obsPassword: HTMLInputElement,
 *     obsReveal: HTMLButtonElement,
 *     obsSave: HTMLButtonElement,
 *     obsClear: HTMLButtonElement,
 *   },
 *   client: ReturnType<typeof import('./connection-client.js').createConnectionClient>,
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   setIntervalImpl?: typeof setInterval,
 *   clearIntervalImpl?: typeof clearInterval,
 * }} input
 */
export function createSettingsController(input) {
  const { elements, client } = input;
  const setIntervalImpl = input.setIntervalImpl ?? setInterval;
  const clearIntervalImpl = input.clearIntervalImpl ?? clearInterval;
  /** @type {import('./connection-client.js').ObsConnectionView | null} */
  let view = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let poll = null;

  /** @param {string} message @param {boolean} [isError] */
  function say(message, isError = false) {
    elements.status.textContent = message;
    elements.status.dataset.level = isError ? 'error' : 'info';
  }

  /** @param {boolean} shown */
  function reveal(shown) {
    elements.obsPassword.type = shown ? 'text' : 'password';
    elements.obsReveal.setAttribute('aria-pressed', String(shown));
    elements.obsReveal.setAttribute('aria-label', shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    elements.obsReveal.textContent = shown ? 'Masquer' : 'Afficher';
  }

  function forgetTypedPassword() {
    elements.obsPassword.value = '';
    reveal(false);
  }

  /** @param {import('./connection-client.js').ObsConnectionView} next @param {boolean} fillUrl */
  function render(next, fillUrl) {
    view = next;
    const message = obsStatusMessage({ connected: next.connected, configured: next.configured, reason: next.reason, scenes: next.scenes });
    elements.obsStatus.textContent = message.text;
    elements.obsStatus.dataset.tone = message.tone;
    if (fillUrl) elements.obsUrl.value = next.url;
    elements.obsPassword.placeholder = !next.passwordSet
      ? 'mot de passe du serveur WebSocket d’OBS'
      : next.source === 'env' ? 'défini dans .env — saisissez-en un pour le remplacer' : 'enregistré — laissez vide pour le garder';
    elements.obsClear.disabled = next.source !== 'settings';
    elements.obsClear.title = next.source === 'env' ? 'Ce mot de passe vient du fichier .env : il ne s’efface pas d’ici' : '';
  }

  async function refresh(fillUrl = false) {
    try {
      render((await client.read()).obs, fillUrl);
    } catch (error) {
      elements.obsStatus.textContent = `Réglages indisponibles : ${errorMessage(error)}`;
      elements.obsStatus.dataset.tone = 'attention';
    }
  }

  async function save() {
    const typedUrl = elements.obsUrl.value.trim();
    /** @type {{ url?: string, password?: string }} */
    const patch = {};
    if (view === null || typedUrl !== view.url) patch.url = typedUrl;
    if (elements.obsPassword.value !== '') patch.password = elements.obsPassword.value;
    if (Object.keys(patch).length === 0) {
      say('Rien à changer.');
      return;
    }
    try {
      render((await client.saveObs(patch)).obs, true);
    } catch (error) {
      say(errorMessage(error), true);
      return;
    }
    forgetTypedPassword();
    say('Enregistré — connexion à OBS en cours.');
    input.report.ok('réglages OBS enregistrés');
  }

  async function clearPassword() {
    try {
      render((await client.saveObs({ password: null })).obs, false);
    } catch (error) {
      say(errorMessage(error), true);
      return;
    }
    forgetTypedPassword();
    say('Mot de passe effacé.');
    input.report.ok('mot de passe OBS effacé');
  }

  function stopPolling() {
    if (poll !== null) clearIntervalImpl(poll);
    poll = null;
  }

  elements.obsReveal.addEventListener('click', () => reveal(elements.obsPassword.type === 'password'));
  elements.obsSave.addEventListener('click', () => { void save(); });
  elements.obsClear.addEventListener('click', () => { void clearPassword(); });
  elements.obsPassword.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); void save(); }
  });
  elements.obsUrl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); void save(); }
  });
  elements.close.addEventListener('click', () => elements.dialog.close());
  elements.dialog.addEventListener('close', () => {
    stopPolling();
    forgetTypedPassword();
  });

  return {
    async open() {
      say('');
      forgetTypedPassword();
      view = null;
      if (typeof elements.dialog.showModal === 'function') elements.dialog.showModal();
      else elements.dialog.setAttribute('open', '');
      await refresh(true);
      stopPolling();
      poll = setIntervalImpl(() => { void refresh(); }, SETTINGS_POLL_MS);
    },
  };
}
