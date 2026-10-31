// @ts-check
import { errorMessage } from './error-message.js';

/**
 * dev/twitch-auth.js — L'autorisation Twitch par **code d'appareil** (Device Code Grant), sans secret ni page de retour.
 *
 * L'application est un client **public** de Twitch (type choisi à la création de l'application sur dev.twitch.tv) : elle ne détient aucun
 * secret. L'owner ouvre une adresse Twitch, tape un code, et autorise. Faits tenus de la documentation Twitch :
 *   - `POST {id}/oauth2/device` (`client_id`, `scopes` séparés par des espaces) → `device_code`, `user_code`, `verification_uri`, `expires_in`, `interval` ;
 *   - `POST {id}/oauth2/token` (`client_id`, `scopes`, `device_code`, `grant_type=urn:ietf:params:oauth:grant-type:device_code`) : 400 `authorization_pending`
 *     tant que l'owner n'a pas fini ; sinon `access_token`, `refresh_token`, `expires_in` (4 h), `scope` ;
 *   - rafraîchir : `POST {id}/oauth2/token` (`client_id`, `grant_type=refresh_token`, `refresh_token`, sans secret pour un client public). Un jeton de
 *     rafraîchissement ne sert **qu'une fois** (le neuf remplace l'ancien) et expire après 30 jours d'inactivité ;
 *   - `GET {id}/oauth2/validate` (`Authorization: OAuth <jeton>`) → `user_id`, `login`, `scopes`, `expires_in` ; 401 si le jeton est invalide.
 *
 * Les fonctions ne lèvent jamais : un échec est un résultat `{ ok: false, … }` que l'interface sait dire. Le réseau, l'adresse de Twitch
 * (`idUrl`, redirigeable vers un faux Twitch pour les essais) et l'horloge sont injectés.
 *
 * @typedef {{ accessToken: string, refreshToken: string, expiresAt: number, scopes: string[] }} TwitchTokens
 * @typedef {{ deviceCode: string, userCode: string, verificationUri: string, expiresInSeconds: number, intervalSeconds: number }} DeviceCode
 */

/** Ce que l'application demande : suivre (modérateurs), abonnements, bits. Les raids n'exigent aucune portée. */
export const TWITCH_SCOPES = Object.freeze(['moderator:read:followers', 'channel:read:subscriptions', 'bits:read']);

export const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

/** @param {unknown} value @returns {value is string} */
const isText = (value) => typeof value === 'string' && value !== '';

/**
 * @param {{ idUrl?: string, fetchImpl?: typeof fetch, now?: () => number }} [options]
 */
export function createTwitchAuth({ idUrl = 'https://id.twitch.tv', fetchImpl = (...args) => fetch(...args), now = Date.now } = {}) {
  const root = idUrl.replace(/\/$/, '');

  /**
   * @param {string} path
   * @param {Record<string, string>} params
   * @returns {Promise<{ status: number, body: Record<string, unknown> } | { failure: string }>}
   */
  async function postForm(path, params) {
    let response;
    try {
      response = await fetchImpl(`${root}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
      });
    } catch (error) {
      return { failure: `Twitch injoignable : ${errorMessage(error)}` };
    }
    /** @type {Record<string, unknown>} */
    let body = {};
    try {
      const parsed = await response.json();
      if (typeof parsed === 'object' && parsed !== null) body = parsed;
    } catch { /* corps absent ou illisible : le statut suffit */ }
    return { status: response.status, body };
  }

  /** @param {Record<string, unknown>} body @param {number} status */
  const reason = (body, status) => (isText(body.message) ? body.message : `HTTP ${status}`);

  /** @param {Record<string, unknown>} body @returns {TwitchTokens | null} */
  function tokensFrom(body) {
    if (!isText(body.access_token) || !isText(body.refresh_token) || typeof body.expires_in !== 'number') return null;
    const scopes = Array.isArray(body.scope) ? body.scope.filter(isText) : typeof body.scope === 'string' ? body.scope.split(' ').filter(Boolean) : [];
    return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: now() + body.expires_in * 1000, scopes };
  }

  return {
    /**
     * Demande un code à taper sur Twitch.
     * @param {{ clientId: string, scopes?: readonly string[] }} input
     * @returns {Promise<{ ok: true, device: DeviceCode } | { ok: false, error: string }>}
     */
    async startDeviceFlow({ clientId, scopes = TWITCH_SCOPES }) {
      const result = await postForm('/oauth2/device', { client_id: clientId, scopes: scopes.join(' ') });
      if ('failure' in result) return { ok: false, error: result.failure };
      const { body, status } = result;
      if (status !== 200 || !isText(body.device_code) || !isText(body.user_code) || !isText(body.verification_uri)) {
        return { ok: false, error: `Twitch refuse la demande : ${reason(body, status)}${status === 400 || status === 401 ? ' — vérifiez l’identifiant client (application « Public »)' : ''}` };
      }
      return {
        ok: true,
        device: {
          deviceCode: body.device_code,
          userCode: body.user_code,
          verificationUri: body.verification_uri,
          expiresInSeconds: typeof body.expires_in === 'number' ? body.expires_in : 1800,
          intervalSeconds: typeof body.interval === 'number' && body.interval > 0 ? body.interval : 5,
        },
      };
    },

    /**
     * Un essai d'échange du code : `pending` tant que l'owner n'a pas autorisé.
     * @param {{ clientId: string, deviceCode: string, scopes?: readonly string[] }} input
     * @returns {Promise<{ status: 'ok', tokens: TwitchTokens } | { status: 'pending' } | { status: 'slow' } | { status: 'error', error: string }>}
     */
    async exchangeDeviceCode({ clientId, deviceCode, scopes = TWITCH_SCOPES }) {
      const result = await postForm('/oauth2/token', { client_id: clientId, scopes: scopes.join(' '), device_code: deviceCode, grant_type: DEVICE_GRANT });
      if ('failure' in result) return { status: 'error', error: result.failure };
      const { body, status } = result;
      if (status === 200) {
        const tokens = tokensFrom(body);
        return tokens === null ? { status: 'error', error: 'réponse de Twitch incomplète (jetons manquants)' } : { status: 'ok', tokens };
      }
      const message = reason(body, status);
      if (message === 'authorization_pending') return { status: 'pending' };
      if (message === 'slow_down') return { status: 'slow' };
      if (message === 'expired_token') return { status: 'error', error: 'le code a expiré : recommencez' };
      if (message === 'access_denied') return { status: 'error', error: 'l’autorisation a été refusée sur Twitch' };
      return { status: 'error', error: `Twitch refuse l’échange : ${message}` };
    },

    /**
     * @param {{ clientId: string, refreshToken: string }} input
     * @returns {Promise<{ ok: true, tokens: TwitchTokens } | { ok: false, error: string, rejected: boolean }>}
     */
    async refresh({ clientId, refreshToken }) {
      const result = await postForm('/oauth2/token', { client_id: clientId, grant_type: 'refresh_token', refresh_token: refreshToken });
      if ('failure' in result) return { ok: false, error: result.failure, rejected: false };
      const { body, status } = result;
      const tokens = status === 200 ? tokensFrom(body) : null;
      if (tokens !== null) return { ok: true, tokens };
      // 400 / 401 : le jeton de rafraîchissement ne vaut plus rien (déjà utilisé, expiré, accès retiré) — on ne peut que se reconnecter.
      return { ok: false, error: `Twitch refuse le rafraîchissement : ${reason(body, status)}`, rejected: status === 400 || status === 401 };
    },

    /**
     * @param {string} accessToken
     * @returns {Promise<{ ok: true, userId: string, login: string, scopes: string[], clientId: string } | { ok: false, error: string, rejected: boolean }>}
     */
    async validate(accessToken) {
      let response;
      try {
        response = await fetchImpl(`${root}/oauth2/validate`, { headers: { Authorization: `OAuth ${accessToken}` } });
      } catch (error) {
        return { ok: false, error: `Twitch injoignable : ${errorMessage(error)}`, rejected: false };
      }
      /** @type {Record<string, unknown>} */
      let body = {};
      try {
        const parsed = await response.json();
        if (typeof parsed === 'object' && parsed !== null) body = parsed;
      } catch { /* corps illisible */ }
      if (response.status !== 200 || !isText(body.user_id) || !isText(body.login)) {
        return { ok: false, error: `jeton refusé par Twitch : ${reason(body, response.status)}`, rejected: response.status === 401 };
      }
      return {
        ok: true,
        userId: body.user_id,
        login: body.login,
        scopes: Array.isArray(body.scopes) ? body.scopes.filter(isText) : [],
        clientId: isText(body.client_id) ? body.client_id : '',
      };
    },

    /**
     * Révoque un jeton (meilleur effort : une déconnexion ne dépend pas de la réponse de Twitch).
     * @param {{ clientId: string, token: string }} input
     * @returns {Promise<boolean>}
     */
    async revoke({ clientId, token }) {
      const result = await postForm('/oauth2/revoke', { client_id: clientId, token });
      return !('failure' in result) && result.status === 200;
    },
  };
}
