// @ts-check
import { ASSET_ID_PATTERN, MAX_ASSET_BYTES, collectAssetUsage } from './asset-format.js';
import { CORS_HEADERS, jsonError } from './dev-server-shared.js';
import { errorMessage } from './error-message.js';

/**
 * dev/asset-routes.js — Routes de la médiathèque d'images.
 *
 *   GET    /assets        — `{ assets }` : chaque asset avec son nombre d'usages dans le fichier d'état (scènes, brouillons, historique).
 *   POST   /assets?name=  — le corps est le fichier ; 201 `{ asset, created }` (`created: false` : cette image était déjà là), 400 si
 *                           ce n'est pas une image acceptée, 413 si elle est trop lourde.
 *   GET    /assets/<id>   — le fichier, avec le type reconnu à son contenu ; mis en cache sans limite (le contenu d'un identifiant ne change jamais).
 *   DELETE /assets/<id>   — retire l'asset ; 409 `{ uses }` tant qu'une scène, un brouillon ou l'historique le référence.
 *
 * Aucun état ici : le magasin d'assets et le magasin d'état sont fournis.
 *
 * @param {{
 *   assets: ReturnType<typeof import('./asset-store.js').createAssetStore>,
 *   store: ReturnType<typeof import('./state-store.js').createStateStore>,
 *   log?: Pick<Console, 'warn' | 'error'>,
 * }} deps
 */
export function createAssetRoutes({ assets, store, log = console }) {
  /** @returns {Promise<Map<string, number>>} les usages ; vide si le fichier d'état est illisible (il le dira lui-même) */
  async function usage() {
    const state = await store.read();
    return state.ok ? collectAssetUsage(state.file) : new Map();
  }

  return {
    /** @param {string} pathname */
    handles: (pathname) => pathname === '/assets' || pathname.startsWith('/assets/'),

    /**
     * @param {Request} req
     * @param {URL} url
     * @returns {Promise<Response>}
     */
    async handle(req, url) {
      try {
        const id = url.pathname === '/assets' ? null : url.pathname.slice('/assets/'.length);
        if (id === null && req.method === 'GET') {
          const uses = await usage();
          return Response.json({ assets: (await assets.list()).map((asset) => ({ ...asset, uses: uses.get(asset.id) ?? 0 })) }, { headers: CORS_HEADERS });
        }
        if (id === null && req.method === 'POST') {
          const declared = Number(req.headers.get('content-length') ?? 0);
          if (declared > MAX_ASSET_BYTES) return jsonError(`fichier trop lourd (${MAX_ASSET_BYTES / 1024 / 1024} Mo au plus)`, 413);
          const result = await assets.put(new Uint8Array(await req.arrayBuffer()), url.searchParams.get('name'));
          if (!result.ok) return jsonError(result.error, result.error.startsWith('fichier trop lourd') ? 413 : 400);
          return Response.json({ asset: result.asset, created: result.created }, { status: 201, headers: CORS_HEADERS });
        }
        if (id !== null && ASSET_ID_PATTERN.test(id) && req.method === 'GET') {
          const found = await assets.read(id);
          if (found === null) return jsonError('asset introuvable', 404);
          return new Response(found.bytes, {
            headers: {
              ...CORS_HEADERS,
              'Content-Type': found.meta.mime,
              'Cache-Control': 'public, max-age=31536000, immutable',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        }
        if (id !== null && ASSET_ID_PATTERN.test(id) && req.method === 'DELETE') {
          const uses = (await usage()).get(id) ?? 0;
          if (uses > 0) return Response.json({ error: `cette image est utilisée ${uses} fois : retirez-la des scènes d'abord`, uses }, { status: 409, headers: CORS_HEADERS });
          return (await assets.remove(id)) ? Response.json({ ok: true }, { headers: CORS_HEADERS }) : jsonError('asset introuvable', 404);
        }
        return jsonError('not found', 404);
      } catch (error) {
        log.error('[background-state-server] médiathèque :', error);
        return jsonError(errorMessage(error), 500);
      }
    },
  };
}
