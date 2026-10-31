// @ts-check
import { createServiceRequest } from './service-request.js';

/**
 * dev/asset-client.js — Le client HTTP de la médiathèque d'images (`dev/asset-routes.js`) : lister, importer, supprimer. Toute
 * erreur sort en `Error` avec le message du serveur (« image trop grande… », « utilisée 2 fois… »), prêt à être montré.
 *
 * @typedef {import('./asset-format.js').AssetMeta & { uses: number }} LibraryAsset
 */

/**
 * @param {{ baseUrl: string, fetchImpl?: typeof fetch }} options
 */
export function createAssetClient({ baseUrl, fetchImpl }) {
  const request = createServiceRequest(fetchImpl === undefined ? { baseUrl } : { baseUrl, fetchImpl });

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

    /** Le contenu d'un asset (pour l'exporter). @param {string} id @returns {Promise<Uint8Array>} */
    async download(id) {
      return new Uint8Array(await (await request(`/assets/${id}`)).arrayBuffer());
    },

    /** @param {string} id */
    async remove(id) {
      await request(`/assets/${id}`, { method: 'DELETE' });
    },
  };
}
