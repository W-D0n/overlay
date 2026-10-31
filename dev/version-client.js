// @ts-check
import { createServiceRequest } from './service-request.js';

/**
 * dev/version-client.js — Le client HTTP des versions nommées d'une scène (`dev/version-routes.js`).
 *
 * @typedef {import('./version-store.js').StoredVersion} StoredVersion
 *
 * @param {{ baseUrl: string, fetchImpl?: typeof fetch }} options
 */
export function createVersionClient({ baseUrl, fetchImpl }) {
  const request = createServiceRequest(fetchImpl === undefined ? { baseUrl } : { baseUrl, fetchImpl });
  /** @param {unknown} body @returns {RequestInit} */
  const json = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  return {
    /** @param {string} sceneId @returns {Promise<StoredVersion[]>} */
    async list(sceneId) {
      return (await (await request(`/versions?scene=${encodeURIComponent(sceneId)}`)).json()).versions;
    },

    /** @param {import('../scene-doc.js').SceneDoc} scene @param {string} name @returns {Promise<StoredVersion>} */
    async add(scene, name) {
      return (await (await request('/versions', json({ scene, name }))).json()).version;
    },

    /** @param {string} id @param {string} name @returns {Promise<StoredVersion>} */
    async rename(id, name) {
      return (await (await request('/versions/rename', json({ id, name }))).json()).version;
    },

    /** @param {string} id */
    async remove(id) {
      await request(`/versions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}
