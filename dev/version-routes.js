// @ts-check
import { CORS_HEADERS, jsonError } from './dev-server-shared.js';
import { errorMessage } from './error-message.js';

/**
 * dev/version-routes.js — Routes des versions nommées d'une scène (`dev/version-store.js`).
 *
 *   GET    /versions?scene=<id> — `{ versions }`, la plus récente d'abord ; toutes les scènes sans `scene`.
 *   POST   /versions            — `{ scene, name }` garde la scène sous un nom : 201 `{ version }`, 400 si le nom ou la scène est refusé,
 *                                 409 si le nom existe déjà ou si la scène a déjà 30 versions.
 *   POST   /versions/rename     — `{ id, name }` : 200 `{ version }`, 404 si elle n'existe plus, 409 si le nom est pris.
 *   DELETE /versions/<id>       — 200, ou 404.
 *
 * @param {{ versions: ReturnType<typeof import('./version-store.js').createVersionStore>, log?: Pick<Console, 'error'> }} deps
 */
export function createVersionRoutes({ versions, log = console }) {
  /** @param {string} error @returns {Response} un nom pris ou une limite atteinte se distinguent d'une entrée invalide */
  const refused = (error) => jsonError(error, /déjà|au plus par scène/.test(error) ? 409 : 400);

  return {
    /** @param {string} pathname */
    handles: (pathname) => pathname === '/versions' || pathname.startsWith('/versions/'),

    /**
     * @param {Request} req
     * @param {URL} url
     * @returns {Promise<Response>}
     */
    async handle(req, url) {
      try {
        if (url.pathname === '/versions' && req.method === 'GET') {
          return Response.json({ versions: await versions.list(url.searchParams.get('scene')) }, { headers: CORS_HEADERS });
        }
        if (url.pathname === '/versions' && req.method === 'POST') {
          const body = await req.json().catch(() => null);
          const result = await versions.add({ scene: body?.scene, name: body?.name });
          return result.ok ? Response.json({ version: result.version }, { status: 201, headers: CORS_HEADERS }) : refused(result.error);
        }
        if (url.pathname === '/versions/rename' && req.method === 'POST') {
          const body = await req.json().catch(() => null);
          const result = await versions.rename(String(body?.id ?? ''), body?.name);
          if (result.ok) return Response.json({ version: result.version }, { headers: CORS_HEADERS });
          return 'missing' in result && result.missing === true ? jsonError(result.error, 404) : refused(result.error);
        }
        if (url.pathname.startsWith('/versions/') && req.method === 'DELETE') {
          const id = decodeURIComponent(url.pathname.slice('/versions/'.length));
          return (await versions.remove(id)) ? Response.json({ ok: true }, { headers: CORS_HEADERS }) : jsonError('version introuvable', 404);
        }
        return jsonError('not found', 404);
      } catch (error) {
        log.error('[background-state-server] versions :', error);
        return jsonError(errorMessage(error), 500);
      }
    },
  };
}
