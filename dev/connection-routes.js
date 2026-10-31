// @ts-check
import { CORS_HEADERS, jsonError } from './dev-server-shared.js';
import { errorMessage } from './error-message.js';
import { applyObsPatch, publicObsView, resolveObs, twitchatAddress, validateObsPatch } from './connection-settings.js';

/**
 * dev/connection-routes.js — Routes des réglages de connexion du Studio (`dev/connection-store.js`).
 *
 *   GET  /connections      — `{ obs, twitchat, alerts }` :
 *                              `obs` : adresse, « un mot de passe est enregistré », origine (`settings` | `env` | `none`), état de la connexion.
 *                                      **Jamais le mot de passe.**
 *                              `twitchat` : l'adresse à donner à Twitchat (avec son jeton : c'est le secret à y coller), les clients connectés,
 *                                      le dernier message, la dernière erreur.
 *                              `alerts` : les dernières alertes reçues, toutes sources, et le nombre de celles que le limiteur a refusées.
 *   POST /connections/obs  — `{ url?, password? }` : enregistre puis reconnecte OBS sans relancer le serveur ; `password: null` efface
 *                            la saisie, `url: ''` revient à l'adresse par défaut. 400 si la valeur est refusée.
 *   POST /connections/twitchat/token — un jeton neuf : l'ancien ne vaut plus rien et les connexions de Twitchat sont coupées.
 *   POST /connections/twitch/client  — `{ clientId }` : l'identifiant client de l'application Twitch (public, pas un secret). 400 s'il est invalide.
 *   POST /connections/twitch/login   — demande un code à taper sur Twitch ; `twitch.userCode` et `twitch.verificationUri` le disent, le serveur attend l'autorisation.
 *   POST /connections/twitch/cancel  — abandonne l'autorisation en attente.
 *   POST /connections/twitch/logout  — déconnecte Twitch : session coupée, jetons révoqués puis effacés.
 *   `twitch` (dans GET) : identifiant client, compte connecté, portées, état de la session ; **jamais un jeton**.
 *
 * Les écritures exigent l'en-tête `X-Overlay-Control: 1` : il force une requête préalable CORS qu'une page étrangère ne passe pas.
 *
 * @param {{
 *   store: ReturnType<typeof import('./connection-store.js').createConnectionStore>,
 *   obs: ReturnType<typeof import('./obs-connection.js').createObsConnection>,
 *   twitchat: Pick<ReturnType<typeof import('./twitchat-link.js').createTwitchatLink>, 'view' | 'disconnectAll'>,
 *   twitch: Pick<ReturnType<typeof import('./twitch-connection.js').createTwitchConnection>, 'view' | 'setClientId' | 'startLogin' | 'cancelLogin' | 'logout'>,
 *   intake: Pick<ReturnType<typeof import('./event-intake.js').createEventIntake>, 'recent' | 'refused'>,
 *   statePort: number,
 *   env: Record<string, string | undefined>,
 *   log?: Pick<Console, 'error'>,
 * }} deps
 */
export function createConnectionRoutes({ store, obs, twitchat, twitch, intake, statePort, env, log = console }) {
  async function view() {
    const file = await store.read();
    const token = await store.twitchatToken();
    return {
      obs: publicObsView(resolveObs({ file, env }), obs.status(), file.obs.url !== undefined),
      twitchat: { token, ...twitchatAddress({ statePort, token }), ...twitchat.view() },
      twitch: twitch.view(),
      alerts: { recent: intake.recent(), refused: intake.refused },
    };
  }

  /** @param {Request} req @returns {Response | null} */
  function requireControl(req) {
    return req.headers.get('X-Overlay-Control') === '1' ? null : jsonError('en-tête X-Overlay-Control requis', 400);
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
          const refused = requireControl(req);
          if (refused !== null) return refused;
          const checked = validateObsPatch(await req.json().catch(() => null));
          if (!checked.ok) return jsonError(checked.errors.join(' ; '), 400);
          await store.update((file) => applyObsPatch(file, checked.patch));
          await obs.restart();
          return Response.json(await view(), { headers: CORS_HEADERS });
        }
        if (url.pathname === '/connections/twitchat/token' && req.method === 'POST') {
          const refused = requireControl(req);
          if (refused !== null) return refused;
          await store.regenerateTwitchatToken();
          twitchat.disconnectAll();
          return Response.json(await view(), { headers: CORS_HEADERS });
        }
        if (url.pathname.startsWith('/connections/twitch/') && req.method === 'POST') {
          const refused = requireControl(req);
          if (refused !== null) return refused;
          const action = url.pathname.slice('/connections/twitch/'.length);
          if (action === 'client') {
            const body = await req.json().catch(() => null);
            const result = await twitch.setClientId(body?.clientId);
            if (!result.ok) return jsonError(result.error, 400);
          } else if (action === 'login') {
            const result = await twitch.startLogin();
            if (!result.ok) return jsonError(result.error, 400);
          } else if (action === 'cancel') {
            await twitch.cancelLogin();
          } else if (action === 'logout') {
            await twitch.logout();
          } else {
            return jsonError('not found', 404);
          }
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
