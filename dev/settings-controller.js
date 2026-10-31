// @ts-check
import { errorMessage } from './error-message.js';
import { obsStatusMessage } from './obs-scene-map-presenter.js';
import { describeAlert, describeTwitch, describeTwitchat, twitchatSample } from './connection-view.js';

/** Au rythme d'un coup d'œil : la fenêtre ouverte suit la connexion (« en cours » → « connecté » ou « refusé »), Twitchat et les alertes reçues. */
export const SETTINGS_POLL_MS = 1000;
/** Un second appui sur « Régénérer » dans ce délai confirme ; passé ce délai, le bouton se réarme. */
export const CONFIRM_MS = 4000;

/**
 * dev/settings-controller.js — La fenêtre « Réglages » du Studio : la connexion à OBS (adresse, mot de passe), Twitch (identifiant client, code
 * d'autorisation), le lien avec Twitchat, et les alertes reçues (de toute source).
 *
 * Le mot de passe d'OBS est saisi dans un champ masqué dont un bouton **Afficher / Masquer** bascule les caractères. Seule la **saisie en
 * cours** peut s'afficher : le serveur ne renvoie jamais un mot de passe déjà enregistré (il dit seulement qu'il y en a un), et la fenêtre
 * ne le garde pas — le champ est vidé et remasqué à l'enregistrement et à la fermeture. Laisser le champ vide conserve le mot de passe
 * enregistré. Enregistrer reconnecte OBS aussitôt, sans relancer les serveurs ; la fenêtre ouverte relit l'état chaque seconde.
 *
 * Twitch : le Studio ne voit jamais le mot de passe Twitch. « Connecter Twitch » affiche un **code** et l'adresse où le taper ; la fenêtre ouverte relit l'état
 * chaque seconde et passe seule à « connecté » quand l'autorisation est donnée. Les jetons ne quittent jamais le serveur.
 *
 * L'adresse de Twitchat contient un jeton : elle est masquée comme un mot de passe, et se copie sans s'afficher. Régénérer le jeton coupe
 * Twitchat (il faut recoller l'adresse) : un second appui le confirme.
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
 *     twitchStatus: HTMLElement,
 *     twitchClient: HTMLInputElement,
 *     twitchClientSave: HTMLButtonElement,
 *     twitchCode: HTMLElement,
 *     twitchLink: HTMLAnchorElement,
 *     twitchUserCode: HTMLElement,
 *     twitchCodeCopy: HTMLButtonElement,
 *     twitchCancel: HTMLButtonElement,
 *     twitchLogin: HTMLButtonElement,
 *     twitchLogout: HTMLButtonElement,
 *     twitchatStatus: HTMLElement,
 *     twitchatAddress: HTMLInputElement,
 *     twitchatReveal: HTMLButtonElement,
 *     twitchatCopy: HTMLButtonElement,
 *     twitchatHostPort: HTMLElement,
 *     twitchatSampleType: HTMLSelectElement,
 *     twitchatSampleToken: HTMLInputElement,
 *     twitchatSample: HTMLButtonElement,
 *     twitchatRegenerate: HTMLButtonElement,
 *     alerts: HTMLElement,
 *   },
 *   client: ReturnType<typeof import('./connection-client.js').createConnectionClient>,
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   clipboard?: { writeText: (text: string) => Promise<void> },
 *   now?: () => number,
 *   setIntervalImpl?: typeof setInterval,
 *   clearIntervalImpl?: typeof clearInterval,
 *   setTimeoutImpl?: typeof setTimeout,
 *   clearTimeoutImpl?: typeof clearTimeout,
 * }} input
 */
export function createSettingsController(input) {
  const { elements, client } = input;
  const now = input.now ?? Date.now;
  const setIntervalImpl = input.setIntervalImpl ?? setInterval;
  const clearIntervalImpl = input.clearIntervalImpl ?? clearInterval;
  const setTimeoutImpl = input.setTimeoutImpl ?? setTimeout;
  const clearTimeoutImpl = input.clearTimeoutImpl ?? clearTimeout;
  /** @type {import('./connection-client.js').ConnectionsView | null} */
  let view = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let poll = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let confirmTimer = null;

  /** @param {string} message @param {boolean} [isError] */
  function say(message, isError = false) {
    elements.status.textContent = message;
    elements.status.dataset.level = isError ? 'error' : 'info';
  }

  /** @param {HTMLInputElement} field @param {HTMLButtonElement} button @param {string} noun @param {boolean} shown */
  function reveal(field, button, noun, shown) {
    field.type = shown ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(shown));
    button.setAttribute('aria-label', `${shown ? 'Masquer' : 'Afficher'} ${noun}`);
    button.textContent = shown ? 'Masquer' : 'Afficher';
  }

  const revealPassword = (/** @type {boolean} */ shown) => reveal(elements.obsPassword, elements.obsReveal, 'le mot de passe', shown);
  const revealAddress = (/** @type {boolean} */ shown) => reveal(elements.twitchatAddress, elements.twitchatReveal, 'l’adresse de Twitchat', shown);

  function forgetTyped() {
    elements.obsPassword.value = '';
    revealPassword(false);
    elements.twitchatAddress.value = '';
    revealAddress(false);
    disarmRegenerate();
  }

  function disarmRegenerate() {
    if (confirmTimer !== null) clearTimeoutImpl(confirmTimer);
    confirmTimer = null;
    elements.twitchatRegenerate.textContent = 'Régénérer le jeton';
    elements.twitchatRegenerate.dataset.armed = 'false';
  }

  /** @param {import('./connection-client.js').ConnectionsView} next @param {boolean} fillUrl */
  function render(next, fillUrl) {
    view = next;
    const { obs, twitchat, twitch, alerts } = next;
    const message = obsStatusMessage({ connected: obs.connected, configured: obs.configured, reason: obs.reason, scenes: obs.scenes });
    elements.obsStatus.textContent = message.text;
    elements.obsStatus.dataset.tone = message.tone;
    if (fillUrl) {
      elements.obsUrl.value = obs.url;
      elements.twitchClient.value = twitch.clientId ?? '';
    }
    elements.obsPassword.placeholder = !obs.passwordSet
      ? 'mot de passe du serveur WebSocket d’OBS'
      : obs.source === 'env' ? 'défini dans .env — saisissez-en un pour le remplacer' : 'enregistré — laissez vide pour le garder';
    elements.obsClear.disabled = obs.source !== 'settings';
    elements.obsClear.title = obs.source === 'env' ? 'Ce mot de passe vient du fichier .env : il ne s’efface pas d’ici' : '';

    const twitchState = describeTwitch(twitch, now());
    elements.twitchStatus.textContent = twitchState.text;
    elements.twitchStatus.dataset.tone = twitchState.tone;
    elements.twitchLogin.disabled = !twitchState.canLogin;
    elements.twitchLogin.textContent = twitchState.loginLabel;
    elements.twitchLogout.disabled = !twitchState.canLogout;
    elements.twitchCode.hidden = !twitchState.showCode;
    elements.twitchUserCode.textContent = twitch.userCode ?? '';
    if (twitch.verificationUri !== null && /^https?:\/\//.test(twitch.verificationUri)) elements.twitchLink.href = twitch.verificationUri;
    else elements.twitchLink.removeAttribute('href');

    const state = describeTwitchat(twitchat, now());
    elements.twitchatStatus.textContent = state.text;
    elements.twitchatStatus.dataset.tone = state.tone;
    elements.twitchatAddress.value = twitchat.withToken;
    elements.twitchatHostPort.textContent = `Si Twitchat ne demande qu’un hôte et un port : ${twitchat.base.replace('ws://', '').replace(':', ' — port ')} (sans connexion sécurisée), et cochez « jeton dans le message » pour le modèle.`;

    elements.alerts.replaceChildren();
    if (alerts.recent.length === 0) {
      const empty = elements.dialog.ownerDocument.createElement('li');
      empty.className = 'settings-alerts-empty';
      empty.textContent = 'Aucune alerte reçue depuis le démarrage du serveur.';
      elements.alerts.appendChild(empty);
    }
    for (const entry of alerts.recent) {
      const item = elements.dialog.ownerDocument.createElement('li');
      const time = elements.dialog.ownerDocument.createElement('time');
      time.dateTime = entry.at;
      time.textContent = new Date(entry.at).toLocaleTimeString('fr-FR');
      item.append(time, ` ${describeAlert(entry)}`);
      elements.alerts.appendChild(item);
    }
    if (alerts.refused > 0) {
      const refused = elements.dialog.ownerDocument.createElement('li');
      refused.className = 'settings-alerts-empty';
      refused.textContent = `${alerts.refused} alerte(s) ignorée(s) par la protection contre les rafales.`;
      elements.alerts.appendChild(refused);
    }
  }

  async function refresh(fillUrl = false) {
    try {
      render(await client.read(), fillUrl);
    } catch (error) {
      elements.obsStatus.textContent = `Réglages indisponibles : ${errorMessage(error)}`;
      elements.obsStatus.dataset.tone = 'attention';
    }
  }

  async function save() {
    const typedUrl = elements.obsUrl.value.trim();
    /** @type {{ url?: string, password?: string }} */
    const patch = {};
    if (view === null || typedUrl !== view.obs.url) patch.url = typedUrl;
    if (elements.obsPassword.value !== '') patch.password = elements.obsPassword.value;
    if (Object.keys(patch).length === 0) {
      say('Rien à changer.');
      return;
    }
    try {
      render(await client.saveObs(patch), true);
    } catch (error) {
      say(errorMessage(error), true);
      return;
    }
    elements.obsPassword.value = '';
    revealPassword(false);
    say('Enregistré — connexion à OBS en cours.');
    input.report.ok('réglages OBS enregistrés');
  }

  async function clearPassword() {
    try {
      render(await client.saveObs({ password: null }), false);
    } catch (error) {
      say(errorMessage(error), true);
      return;
    }
    elements.obsPassword.value = '';
    revealPassword(false);
    say('Mot de passe effacé.');
    input.report.ok('mot de passe OBS effacé');
  }

  /** @param {string} text @param {string} what */
  async function copy(text, what) {
    try {
      await (input.clipboard ?? navigator.clipboard).writeText(text);
    } catch (error) {
      say(`Copie impossible : ${errorMessage(error)}`, true);
      return;
    }
    say(`${what} copié dans le presse-papiers.`);
    input.report.ok(`${what} copié`);
  }

  /** @param {Promise<import('./connection-client.js').ConnectionsView>} request @param {string} done */
  async function twitchAction(request, done) {
    try {
      render(await request, false);
    } catch (error) {
      say(errorMessage(error), true);
      await refresh();
      return;
    }
    say(done);
  }

  async function saveTwitchClient() {
    const typed = elements.twitchClient.value.trim();
    if (view !== null && typed === (view.twitch.clientId ?? '')) return say('Rien à changer.');
    await twitchAction(client.saveTwitchClient(typed), 'Identifiant client enregistré.');
  }

  async function regenerate() {
    if (elements.twitchatRegenerate.dataset.armed !== 'true') {
      elements.twitchatRegenerate.dataset.armed = 'true';
      elements.twitchatRegenerate.textContent = 'Confirmer ? (Twitchat sera déconnecté)';
      confirmTimer = setTimeoutImpl(disarmRegenerate, CONFIRM_MS);
      return;
    }
    disarmRegenerate();
    try {
      render(await client.regenerateTwitchatToken(), false);
    } catch (error) {
      say(errorMessage(error), true);
      return;
    }
    say('Nouveau jeton créé : collez la nouvelle adresse dans Twitchat.');
    input.report.ok('jeton Twitchat régénéré');
  }

  function stopPolling() {
    if (poll !== null) clearIntervalImpl(poll);
    poll = null;
  }

  elements.obsReveal.addEventListener('click', () => revealPassword(elements.obsPassword.type === 'password'));
  elements.obsSave.addEventListener('click', () => { void save(); });
  elements.obsClear.addEventListener('click', () => { void clearPassword(); });
  for (const field of [elements.obsPassword, elements.obsUrl]) {
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); void save(); }
    });
  }
  elements.twitchClientSave.addEventListener('click', () => { void saveTwitchClient(); });
  elements.twitchClient.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); void saveTwitchClient(); }
  });
  elements.twitchLogin.addEventListener('click', () => { void twitchAction(client.loginTwitch(), 'Ouvrez l’adresse affichée et tapez le code pour autoriser.'); });
  elements.twitchCancel.addEventListener('click', () => { void twitchAction(client.cancelTwitchLogin(), 'Connexion à Twitch annulée.'); });
  elements.twitchLogout.addEventListener('click', () => { void twitchAction(client.logoutTwitch(), 'Twitch déconnecté.'); });
  elements.twitchCodeCopy.addEventListener('click', () => { if (view?.twitch.userCode) void copy(view.twitch.userCode, 'Le code'); });
  elements.twitchatReveal.addEventListener('click', () => revealAddress(elements.twitchatAddress.type === 'password'));
  elements.twitchatCopy.addEventListener('click', () => { if (view !== null) void copy(view.twitchat.withToken, 'L’adresse de Twitchat'); });
  elements.twitchatSample.addEventListener('click', () => {
    if (view === null) return;
    void copy(twitchatSample(elements.twitchatSampleType.value, elements.twitchatSampleToken.checked ? view.twitchat.token : null), 'Le modèle de message');
  });
  elements.twitchatRegenerate.addEventListener('click', () => { void regenerate(); });
  elements.close.addEventListener('click', () => elements.dialog.close());
  elements.dialog.addEventListener('close', () => {
    stopPolling();
    forgetTyped();
  });

  return {
    async open() {
      say('');
      forgetTyped();
      view = null;
      if (typeof elements.dialog.showModal === 'function') elements.dialog.showModal();
      else elements.dialog.setAttribute('open', '');
      await refresh(true);
      stopPolling();
      poll = setIntervalImpl(() => { void refresh(); }, SETTINGS_POLL_MS);
    },
  };
}
