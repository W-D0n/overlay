// @ts-check
import { createEventSubSession } from './twitch-eventsub.js';
import { TWITCH_SCOPES } from './twitch-auth.js';
import { publicTwitchSettings, validateTwitchClientId, withTwitch, withoutTwitchLogin } from './connection-settings.js';
import { errorMessage } from './error-message.js';

/**
 * dev/twitch-connection.js — La connexion du Studio à Twitch : autorisation par code d'appareil, jetons gardés et rafraîchis, session EventSub
 * dont les notifications deviennent des alertes (`dev/event-intake.js`, source « twitch »).
 *
 * Parcours :
 *   1. l'owner saisit l'**identifiant client** de son application Twitch (public, ce n'est pas un secret) ;
 *   2. « Connecter Twitch » : Twitch donne un **code** et une adresse ; l'owner les ouvre, tape le code, autorise ; le serveur attend l'autorisation ;
 *   3. les portées accordées sont **vérifiées** (une autorisation partielle ne marcherait qu'à moitié, et on le dit) ;
 *   4. les jetons sont rangés dans le fichier des connexions, la session EventSub s'ouvre, et se rouvre seule au démarrage suivant.
 * Le jeton d'accès dure 4 h : il est rafraîchi 5 minutes avant, et à la demande si Twitch répond 401. Le jeton de rafraîchissement ne sert **qu'une
 * fois** : le neuf est écrit dans le fichier **avant** d'être utilisé, et deux rafraîchissements simultanés n'en font qu'un. Si Twitch refuse le
 * rafraîchissement (autorisation retirée, 30 jours d'inactivité), les jetons sont effacés et le Studio demande de se reconnecter.
 * Un jeton n'est jamais renvoyé par l'API (`publicTwitchSettings`).
 *
 * @typedef {'logged-out' | 'login' | 'connecting' | 'connected' | 'reconnecting' | 'error'} TwitchPhase
 *
 * @param {{
 *   store: ReturnType<typeof import('./connection-store.js').createConnectionStore>,
 *   intake: ReturnType<typeof import('./event-intake.js').createEventIntake>,
 *   auth: ReturnType<typeof import('./twitch-auth.js').createTwitchAuth>,
 *   sessionOptions?: Partial<Parameters<typeof createEventSubSession>[0]>,
 *   createSession?: typeof createEventSubSession,
 *   now?: () => number,
 *   sleep?: (ms: number) => Promise<void>,
 *   setTimer?: (callback: () => void, delayMs: number) => unknown,
 *   clearTimer?: (handle: unknown) => void,
 *   log?: Pick<Console, 'info' | 'warn'>,
 * }} deps
 */
export function createTwitchConnection({ store, intake, auth, sessionOptions = {}, createSession = createEventSubSession, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), setTimer = (callback, delayMs) => setTimeout(callback, delayMs), clearTimer = (handle) => clearTimeout(/** @type {*} */ (handle)), log = console }) {
  /** Marge avant l'expiration du jeton d'accès où l'on rafraîchit. */
  const REFRESH_MARGIN_MS = 5 * 60 * 1000;

  /** @type {import('./connection-settings.js').TwitchSettings} */
  let settings = {};
  /** @type {{ phase: TwitchPhase, detail: string | null, subscriptions: number, needsLogin: boolean, userCode: string | null, verificationUri: string | null, loginExpiresAt: number | null, lastAlertAt: string | null }} */
  const runtime = { phase: 'logged-out', detail: null, subscriptions: 0, needsLogin: false, userCode: null, verificationUri: null, loginExpiresAt: null, lastAlertAt: null };
  /** @type {ReturnType<typeof createEventSubSession> | null} */
  let session = null;
  /** Incrémenté à chaque début, annulation ou déconnexion : une attente de connexion périmée s'arrête d'elle-même. */
  let generation = 0;
  /** @type {Promise<boolean> | null} */
  let refreshing = null;
  /** @type {unknown} */
  let refreshTimer = null;

  /** @param {Partial<typeof runtime>} patch */
  function set(patch) {
    Object.assign(runtime, patch);
  }

  /** @param {Parameters<typeof withTwitch>[1]} changes */
  async function persist(changes) {
    settings = (await store.update((file) => withTwitch(file, changes))).twitch;
  }

  function stopSession() {
    if (refreshTimer !== null) clearTimer(refreshTimer);
    refreshTimer = null;
    session?.stop();
    session = null;
  }

  /** @param {string} detail */
  async function loseLogin(detail) {
    stopSession();
    settings = (await store.update((file) => withoutTwitchLogin(file))).twitch;
    set({ phase: 'error', detail, needsLogin: true, subscriptions: 0 });
  }

  /** @returns {Promise<boolean>} vrai si un jeton frais est en main */
  function refreshNow() {
    if (refreshing !== null) return refreshing;
    refreshing = (async () => {
      const { clientId, refreshToken } = settings;
      if (clientId === undefined || refreshToken === undefined) return false;
      const result = await auth.refresh({ clientId, refreshToken });
      if (!result.ok) {
        log.warn(`[twitch] ${result.error}`);
        if (result.rejected) await loseLogin('Twitch a retiré l’autorisation (jeton de rafraîchissement refusé) : reconnectez Twitch');
        return false;
      }
      // Le jeton de rafraîchissement ne sert qu'une fois : le neuf est écrit avant tout autre usage.
      await persist({ accessToken: result.tokens.accessToken, refreshToken: result.tokens.refreshToken, expiresAt: result.tokens.expiresAt });
      armRefresh();
      return true;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  function armRefresh() {
    if (refreshTimer !== null) clearTimer(refreshTimer);
    const expiresAt = settings.expiresAt ?? now();
    const delay = Math.max(1000, expiresAt - now() - REFRESH_MARGIN_MS);
    refreshTimer = setTimer(() => { void refreshNow(); }, delay);
  }

  async function connect() {
    const { clientId, userId } = settings;
    if (clientId === undefined || userId === undefined || settings.accessToken === undefined) return;
    stopSession();
    set({ phase: 'connecting', detail: null, needsLogin: false, subscriptions: 0 });
    if ((settings.expiresAt ?? 0) - now() < REFRESH_MARGIN_MS && !(await refreshNow())) {
      if (runtime.phase !== 'error') set({ phase: 'error', detail: 'impossible de rafraîchir l’autorisation Twitch pour l’instant : nouvel essai au prochain démarrage', needsLogin: false });
      return;
    }
    armRefresh();
    session = createSession({
      userId,
      clientId,
      getAccessToken: () => settings.accessToken ?? '',
      refreshAccessToken: refreshNow,
      onAlert: (alert) => {
        const published = intake.publish(alert, 'twitch');
        if (published.ok) runtime.lastAlertAt = new Date(now()).toISOString();
        else log.warn(`[twitch] ${published.error}`);
      },
      onStatus: (status) => {
        const phase = status.state;
        set({ phase, detail: status.detail, subscriptions: status.subscriptions, needsLogin: status.needsLogin });
        if (status.state === 'error' && status.needsLogin) { if (refreshTimer !== null) clearTimer(refreshTimer); refreshTimer = null; }
      },
      ...sessionOptions,
    });
    session.start();
  }

  /** @param {import('./twitch-auth.js').TwitchTokens} tokens @param {number} mine */
  async function finishLogin(tokens, mine) {
    const clientId = settings.clientId ?? '';
    const checked = await auth.validate(tokens.accessToken);
    if (mine !== generation) return;
    if (!checked.ok) return void set({ phase: 'error', detail: checked.error, needsLogin: true, userCode: null, verificationUri: null });
    if (checked.clientId !== '' && checked.clientId !== clientId) return void set({ phase: 'error', detail: 'l’autorisation vient d’une autre application Twitch : recommencez', needsLogin: true, userCode: null, verificationUri: null });
    const missing = TWITCH_SCOPES.filter((scope) => !checked.scopes.includes(scope));
    if (missing.length > 0) return void set({ phase: 'error', detail: `autorisations incomplètes (manque : ${missing.join(', ')}) : recommencez et acceptez tout`, needsLogin: true, userCode: null, verificationUri: null });
    await persist({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt, userId: checked.userId, login: checked.login, scopes: checked.scopes });
    if (mine !== generation) return;
    set({ userCode: null, verificationUri: null, loginExpiresAt: null });
    await connect();
  }

  /** @param {import('./twitch-auth.js').DeviceCode} device @param {number} mine */
  async function waitForAuthorization(device, mine) {
    let interval = device.intervalSeconds;
    const deadline = now() + device.expiresInSeconds * 1000;
    while (mine === generation) {
      await sleep(interval * 1000);
      if (mine !== generation) return;
      if (now() > deadline) return void set({ phase: 'error', detail: 'le code a expiré : recommencez', needsLogin: true, userCode: null, verificationUri: null });
      const clientId = settings.clientId ?? '';
      const result = await auth.exchangeDeviceCode({ clientId, deviceCode: device.deviceCode });
      if (mine !== generation) return;
      if (result.status === 'pending') continue;
      if (result.status === 'slow') { interval += 5; continue; }
      if (result.status === 'error') return void set({ phase: 'error', detail: result.error, needsLogin: true, userCode: null, verificationUri: null });
      return finishLogin(result.tokens, mine);
    }
  }

  return {
    /** Au démarrage du serveur : relit les réglages et, si Twitch était connecté, rouvre la session. */
    async init() {
      try {
        settings = (await store.read()).twitch;
      } catch (error) {
        log.warn(`[twitch] réglages illisibles : ${errorMessage(error)}`);
        return;
      }
      if (publicTwitchSettings(settings).loggedIn) await connect();
    },

    /** @param {unknown} raw @returns {Promise<{ ok: true } | { ok: false, error: string }>} */
    async setClientId(raw) {
      const checked = validateTwitchClientId(raw);
      if (!checked.ok) return checked;
      if (settings.clientId !== undefined && settings.clientId !== checked.clientId) await this.logout();
      await persist({ clientId: checked.clientId });
      return { ok: true };
    },

    /** @returns {Promise<{ ok: true } | { ok: false, error: string }>} */
    async startLogin() {
      if (settings.clientId === undefined) return { ok: false, error: 'saisissez d’abord l’identifiant client de votre application Twitch' };
      generation += 1;
      const mine = generation;
      stopSession();
      const started = await auth.startDeviceFlow({ clientId: settings.clientId });
      if (mine !== generation) return { ok: false, error: 'connexion annulée' };
      if (!started.ok) {
        set({ phase: 'error', detail: started.error, needsLogin: true, userCode: null, verificationUri: null });
        return started;
      }
      set({ phase: 'login', detail: null, needsLogin: false, userCode: started.device.userCode, verificationUri: started.device.verificationUri, loginExpiresAt: now() + started.device.expiresInSeconds * 1000 });
      void waitForAuthorization(started.device, mine);
      return { ok: true };
    },

    /** Abandonne une autorisation en attente : déjà connecté, la session reprend ; sinon on redevient déconnecté. */
    async cancelLogin() {
      generation += 1;
      const waiting = runtime.phase === 'login';
      set({ userCode: null, verificationUri: null, loginExpiresAt: null, detail: null });
      if (!waiting) return;
      if (publicTwitchSettings(settings).loggedIn) await connect();
      else set({ phase: 'logged-out' });
    },

    /** Coupe la session, révoque le jeton chez Twitch (au mieux) et efface les jetons ; l'identifiant client reste. */
    async logout() {
      generation += 1;
      const { clientId, accessToken } = settings;
      stopSession();
      settings = (await store.update((file) => withoutTwitchLogin(file))).twitch;
      set({ phase: 'logged-out', detail: null, needsLogin: false, subscriptions: 0, userCode: null, verificationUri: null, loginExpiresAt: null });
      if (clientId !== undefined && accessToken !== undefined) await auth.revoke({ clientId, token: accessToken });
    },

    stop() {
      generation += 1;
      stopSession();
    },

    view: () => ({ ...publicTwitchSettings(settings), ...runtime }),
  };
}
