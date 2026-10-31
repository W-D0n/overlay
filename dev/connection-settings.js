// @ts-check
/**
 * dev/connection-settings.js — Les réglages de connexion saisis dans le Studio (OBS, puis Twitchat et Twitch), purs.
 *
 * Ils vivent dans un fichier à part du fichier d'état (`dev/connection-store.js`) : ce sont des secrets, jamais exportés avec les
 * scènes, jamais renvoyés par l'API. Le serveur ne rend que ce qu'il faut pour les afficher (`publicObsView` : « un mot de passe est
 * enregistré », pas le mot de passe). Une valeur saisie l'emporte sur l'environnement (`OBS_WS_URL`, `OBS_WS_PASSWORD`, qui restent
 * lus : une installation existante continue de marcher sans rien ressaisir).
 *
 * @typedef {{ url?: string, password?: string }} ObsSettings
 * @typedef {{ token?: string }} TwitchatSettings
 * @typedef {{ obs: ObsSettings, twitchat: TwitchatSettings }} ConnectionFile
 * @typedef {{ url: string, password: string, source: 'settings' | 'env' | 'none' }} ResolvedObs
 * @typedef {{ url?: string | null, password?: string | null }} ObsPatch
 */

export const DEFAULT_OBS_URL = 'ws://127.0.0.1:4455';
export const MAX_OBS_URL_LENGTH = 200;
export const MAX_OBS_PASSWORD_LENGTH = 256;

/** Les caractères de contrôle (retour à la ligne, tabulation…) n'ont leur place ni dans une adresse ni dans un mot de passe. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** @param {unknown} value @returns {value is string} */
const isText = (value) => typeof value === 'string';

/**
 * Le fichier tel qu'on le lit : ce qui n'a pas la bonne forme est ignoré, jamais deviné.
 * @param {unknown} raw
 * @returns {ConnectionFile}
 */
export function normalizeConnectionFile(raw) {
  const record = typeof raw === 'object' && raw !== null ? /** @type {Record<string, unknown>} */ (raw) : {};
  const obs = typeof record.obs === 'object' && record.obs !== null ? /** @type {Record<string, unknown>} */ (record.obs) : {};
  const twitchat = typeof record.twitchat === 'object' && record.twitchat !== null ? /** @type {Record<string, unknown>} */ (record.twitchat) : {};
  /** @type {ObsSettings} */
  const settings = {};
  if (isText(obs.url) && obs.url !== '') settings.url = obs.url;
  if (isText(obs.password) && obs.password !== '') settings.password = obs.password;
  /** @type {TwitchatSettings} */
  const link = {};
  if (isText(twitchat.token) && TWITCHAT_TOKEN.test(twitchat.token)) link.token = twitchat.token;
  return { obs: settings, twitchat: link };
}

/** Le jeton de Twitchat : de l'hexadécimal, assez long pour ne pas se deviner. */
const TWITCHAT_TOKEN = /^[0-9a-f]{32,128}$/;

/**
 * Un jeton neuf : 24 octets aléatoires du système, en hexadécimal.
 * @param {(bytes: Uint8Array) => Uint8Array} [fill]
 */
export function newTwitchatToken(fill = (bytes) => crypto.getRandomValues(bytes)) {
  return [...fill(new Uint8Array(24))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {ConnectionFile} file
 * @param {string} token
 * @returns {ConnectionFile}
 */
export function withTwitchatToken(file, token) {
  return { ...file, twitchat: { ...file.twitchat, token } };
}

/**
 * L'adresse à indiquer dans Twitchat (page → paramètres → connexions → WebSocket), et le jeton qu'elle porte.
 * @param {{ statePort: number, token: string }} input
 */
export function twitchatAddress({ statePort, token }) {
  return { base: `ws://127.0.0.1:${statePort}`, withToken: `ws://127.0.0.1:${statePort}/twitchat-ws?token=${token}` };
}

/**
 * @param {unknown} body corps de `POST /connections/obs`
 * @returns {{ ok: true, patch: ObsPatch } | { ok: false, errors: string[] }}
 */
export function validateObsPatch(body) {
  if (typeof body !== 'object' || body === null) return { ok: false, errors: ['corps invalide (objet attendu)'] };
  const record = /** @type {Record<string, unknown>} */ (body);
  /** @type {string[]} */
  const errors = [];
  /** @type {ObsPatch} */
  const patch = {};

  if ('url' in record) {
    if (record.url === null || record.url === '') {
      patch.url = null;
    } else if (!isText(record.url)) {
      errors.push('adresse OBS : texte attendu');
    } else {
      const url = record.url.trim();
      if (url.length > MAX_OBS_URL_LENGTH) errors.push(`adresse OBS trop longue (${MAX_OBS_URL_LENGTH} caractères au plus)`);
      else if (!isWebSocketUrl(url)) errors.push('adresse OBS : elle commence par ws:// ou wss:// (ex. ws://127.0.0.1:4455)');
      else patch.url = url;
    }
  }

  if ('password' in record) {
    if (record.password === null) {
      patch.password = null;
    } else if (!isText(record.password) || record.password === '') {
      errors.push('mot de passe OBS : texte non vide attendu (null pour l’effacer)');
    } else if (record.password.length > MAX_OBS_PASSWORD_LENGTH) {
      errors.push(`mot de passe OBS trop long (${MAX_OBS_PASSWORD_LENGTH} caractères au plus)`);
    } else if (CONTROL_CHARACTERS.test(record.password)) {
      errors.push('mot de passe OBS : les caractères de contrôle sont refusés');
    } else {
      patch.password = record.password;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  if (!('url' in patch) && !('password' in patch)) return { ok: false, errors: ['rien à enregistrer : adresse ou mot de passe attendu'] };
  return { ok: true, patch };
}

/** @param {string} text */
function isWebSocketUrl(text) {
  if (CONTROL_CHARACTERS.test(text)) return false;
  try {
    const { protocol, hostname } = new URL(text);
    return (protocol === 'ws:' || protocol === 'wss:') && hostname !== '';
  } catch {
    return false;
  }
}

/**
 * Applique un patch : `null` retire la valeur saisie (on retombe sur l'environnement, puis sur le défaut).
 * @param {ConnectionFile} file
 * @param {ObsPatch} patch
 * @returns {ConnectionFile}
 */
export function applyObsPatch(file, patch) {
  const obs = { ...file.obs };
  if ('url' in patch) {
    if (patch.url === null || patch.url === undefined) delete obs.url;
    else obs.url = patch.url;
  }
  if ('password' in patch) {
    if (patch.password === null || patch.password === undefined) delete obs.password;
    else obs.password = patch.password;
  }
  return { ...file, obs };
}

/**
 * L'adresse et le mot de passe que le client OBS utilise : la saisie du Studio d'abord, puis l'environnement.
 * @param {{ file: ConnectionFile, env: Record<string, string | undefined> }} input
 * @returns {ResolvedObs}
 */
export function resolveObs({ file, env }) {
  const url = file.obs.url ?? (env.OBS_WS_URL !== undefined && env.OBS_WS_URL !== '' ? env.OBS_WS_URL : DEFAULT_OBS_URL);
  if (file.obs.password !== undefined) return { url, password: file.obs.password, source: 'settings' };
  const fromEnv = env.OBS_WS_PASSWORD ?? '';
  return { url, password: fromEnv, source: fromEnv === '' ? 'none' : 'env' };
}

/**
 * Ce que l'API montre d'OBS : tout, sauf le mot de passe.
 * @param {ResolvedObs} resolved
 * @param {{ connected: boolean, reason: string | null, scenes: string[], activeScene: string | null }} status
 * @param {boolean} urlFromSettings
 */
export function publicObsView(resolved, status, urlFromSettings) {
  return {
    url: resolved.url,
    urlFromSettings,
    passwordSet: resolved.password !== '',
    source: resolved.source,
    configured: resolved.password !== '',
    connected: status.connected,
    reason: status.reason,
    scenes: status.scenes,
    activeScene: status.activeScene,
  };
}
