// @ts-check
import { errorMessage } from './error-message.js';

/**
 * dev/service-request.js — La requête HTTP vers le serveur d'état des clients de la médiathèque et des versions. Toute erreur sort en
 * `Error` avec le message du serveur (« image trop grande… », « une version s'appelle déjà… »), son statut et, s'il en donne, `uses` : prête
 * à être montrée telle quelle. Un serveur éteint se dit clairement (statut 0).
 *
 * @typedef {Error & { status: number, uses?: number }} ServiceError
 *
 * @param {{ baseUrl: string, fetchImpl?: typeof fetch }} options
 * @returns {(path: string, init?: RequestInit) => Promise<Response>}
 */
export function createServiceRequest({ baseUrl, fetchImpl = (...args) => fetch(...args) }) {
  const root = baseUrl.replace(/\/$/, '');
  return async (path, init) => {
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
  };
}
