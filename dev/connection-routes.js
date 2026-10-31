// @ts-check
import { CORS_HEADERS, jsonError } from './dev-server-shared.js';
import { errorMessage } from './error-message.js';
import { applyObsPatch, publicObsView, resolveObs, validateObsPatch } from './connection-settings.js';

/**
 * dev/connection-routes.js — Routes des réglages de connexion du Studio (`dev/connection-store.js`).
 *
 *   GET  /connections      — `{ obs }` : adresse, « un mot de passe est enregistré », origine (`settings` | `env` | `none`), état de la
 *                            connexion. **Jamais le mot de passe.**
 *   POST /connections/obs  — `{ url?, password? }` : enregistre puis reconnecte OBS sans relancer le serveur ; `password: null` efface
 *                            la saisie, `url: ''` revient à l'adresse par défaut. 400 si la valeur est refusée. L'en-tête
 *                            `X-Overlay-Control: 1` est exigé : il force une requête préalable CORS qu'une page étrangère ne passe pas.
 *
 * @param {{
 *   store: ReturnType<typeof import('./connection-store.js').createConnectionStore>,
 *   obs: ReturnType<typeof import('./obs-connection.js').createObsConnection>,
 *   env: Record<string, string | undefined>,
 *   log?: Pick<Console, 'error'>,
 * }} deps
 */
export function createConnectionRoutes({ store, obs, env, log = console }) {
  async function view() {
    const file = await store.read();
    return { obs: publicObsView(resolveObs({ file, env }), obs.status(), file.obs.url !== undefined) };
  }

  return {
    /** @param {string} pathname */
    handles: (pathname) => pathname === '/connections' || pathname.startsWith('/connections/'),

    /**
     * @param {Request} req
     * @param {URL} url
     * @returns {Promise<Response>}
     */
    async handle(req, url) {
      try {
        if (url.pathname === '/connections' && req.method === 'GET') {
          return Response.json(await view(), { headers: CORS_HEADERS });
        }
        if (url.pathname === '/connections/obs' && req.method === 'POST') {
          if (req.headers.get('X-Overlay-Control') !== '1') return jsonError('en-tête X-Overlay-Control requis', 400);
          const checked = validateObsPatch(await req.json().catch(() => null));
          if (!checked.ok) return jsonError(checked.errors.join(' ; '), 400);
          await store.update((file) => applyObsPatch(file, checked.patch));
          await obs.restart();
          return Response.json(await view(), { headers: CORS_HEADERS });
        }
        return jsonError('not found', 404);
      } catch (error) {
        log.error('[background-state-server] connexions :', error);
        return jsonError(errorMessage(error), 500);
      }
    },
  };
}
