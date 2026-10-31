// @ts-check
import { errorMessage } from './error-message.js';

/**
 * dev/asset-client.js — Le client HTTP de la médiathèque d'images (`dev/asset-routes.js`) : lister, importer, supprimer. Toute
 * erreur sort en `Error` avec le message du serveur (« image trop grande… », « utilisée 2 fois… »), prêt à être montré.
 *
 * @typedef {import('./asset-format.js').AssetMeta & { uses: number }} LibraryAsset
 * @typedef {Error & { status: number, uses?: number }} AssetClientError
 */

/**
 * @param {{ baseUrl: string, fetchImpl?: typeof fetch }} options
 */
export function createAssetClient({ baseUrl, fetchImpl = (...args) => fetch(...args) }) {
  const root = baseUrl.replace(/\/$/, '');

  /** @param {string} path @param {RequestInit} [init] */
  async function request(path, init) {
    let response;
    try {
      response = await fetchImpl(`${root}${path}`, init);
    } catch (error) {
      throw Object.assign(new Error(`serveur d’état injoignable : ${errorMessage(error)}`), { status: 0 });
    }
    if (response.ok) return response;
    /** @type {{ error?: string, uses?: number }} */
    let body = {};
    try {
      body = await response.json();
    } catch { /* corps absent ou illisible : le statut suffit */ }
    throw Object.assign(new Error(body.error ?? `HTTP ${response.status}`), { status: response.status, ...(body.uses === undefined ? {} : { uses: body.uses }) });
  }

  return {
    /** @returns {Promise<LibraryAsset[]>} */
    async list() {
      return (await (await request('/assets')).json()).assets;
    },

    /**
     * @param {Blob & { name?: string }} file
     * @returns {Promise<{ asset: import('./asset-format.js').AssetMeta, created: boolean }>}
     */
    async upload(file) {
      return (await request(`/assets?name=${encodeURIComponent(file.name ?? 'image')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      })).json();
    },

    /** @param {string} id */
    async remove(id) {
      await request(`/assets/${id}`, { method: 'DELETE' });
    },
  };
}
