// @ts-check
import { createServiceRequest } from './service-request.js';

/**
 * dev/connection-client.js — Le client HTTP des réglages de connexion (`dev/connection-routes.js`).
 *
 * @typedef {ReturnType<typeof import('./connection-settings.js').publicObsView>} ObsConnectionView
 * @typedef {{ token: string, base: string, withToken: string, clients: number, lastMessageAt: string | null, lastAlertAt: string | null, lastError: string | null }} TwitchatView
 * @typedef {{ recent: import('./event-intake.js').JournalEntry[], refused: number }} AlertsView
 * @typedef {ReturnType<typeof import('./connection-settings.js').publicTwitchSettings> & { phase: string, detail: string | null, subscriptions: number, needsLogin: boolean, userCode: string | null, verificationUri: string | null, loginExpiresAt: number | null, lastAlertAt: string | null }} TwitchView
 * @typedef {{ obs: ObsConnectionView, twitchat: TwitchatView, twitch: TwitchView, alerts: AlertsView }} ConnectionsView
 *
 * @param {{ baseUrl: string, fetchImpl?: typeof fetch }} options
 */
export function createConnectionClient({ baseUrl, fetchImpl }) {
  const request = createServiceRequest(fetchImpl === undefined ? { baseUrl } : { baseUrl, fetchImpl });

  /**
   * L'en-tête `X-Overlay-Control` force une requête préalable CORS : une page étrangère ne la passe pas.
   * @param {string} path
   * @param {unknown} [body]
   * @returns {Promise<ConnectionsView>}
   */
  async function write(path, body) {
    const response = await request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Overlay-Control': '1' },
      body: JSON.stringify(body ?? {}),
    });
    return response.json();
  }

  return {
    /** @returns {Promise<ConnectionsView>} */
    async read() {
      return (await request('/connections')).json();
    },

    /** @param {{ url?: string | null, password?: string | null }} patch */
    saveObs: (patch) => write('/connections/obs', patch),

    /** Un jeton neuf pour Twitchat : l'ancien ne vaut plus rien. */
    regenerateTwitchatToken: () => write('/connections/twitchat/token'),

    /** @param {string} clientId l'identifiant (public) de l'application Twitch */
    saveTwitchClient: (clientId) => write('/connections/twitch/client', { clientId }),
    loginTwitch: () => write('/connections/twitch/login'),
    cancelTwitchLogin: () => write('/connections/twitch/cancel'),
    logoutTwitch: () => write('/connections/twitch/logout'),
  };
}
