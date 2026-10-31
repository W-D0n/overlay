// @ts-check
import { createServiceRequest } from './service-request.js';

/**
 * dev/connection-client.js — Le client HTTP des réglages de connexion (`dev/connection-routes.js`).
 *
 * @typedef {ReturnType<typeof import('./connection-settings.js').publicObsView>} ObsConnectionView
 *
 * @param {{ baseUrl: string, fetchImpl?: typeof fetch }} options
 */
export function createConnectionClient({ baseUrl, fetchImpl }) {
  const request = createServiceRequest(fetchImpl === undefined ? { baseUrl } : { baseUrl, fetchImpl });

  return {
    /** @returns {Promise<{ obs: ObsConnectionView }>} */
    async read() {
      return (await request('/connections')).json();
    },

    /**
     * L'en-tête `X-Overlay-Control` force une requête préalable CORS : une page étrangère ne la passe pas.
     * @param {{ url?: string | null, password?: string | null }} patch
     * @returns {Promise<{ obs: ObsConnectionView }>}
     */
    async saveObs(patch) {
      const response = await request('/connections/obs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Overlay-Control': '1' },
        body: JSON.stringify(patch),
      });
      return response.json();
    },
  };
}
