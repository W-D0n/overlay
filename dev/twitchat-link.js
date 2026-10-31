// @ts-check
import { translateTwitchatMessage } from './twitchat-adapter.js';

/**
 * dev/twitchat-link.js — Le serveur WebSocket auquel Twitchat se connecte pour envoyer ses alertes.
 *
 * Twitchat (page web, hébergée par ses soins) est **client** : ses triggers envoient du JSON à l'adresse indiquée dans ses
 * paramètres. Ce module reçoit ces messages (`dev/twitchat-adapter.js`), et les publie comme n'importe quelle alerte
 * (`dev/event-intake.js`). Il n'envoie rien à Twitchat, sauf un accusé par message (`{ ok, type }` ou `{ ok: false, error }`), utile à qui
 * teste avec un client WebSocket quelconque ; Twitchat, lui, ignore tout message sans `topic`.
 *
 * Accès : la page de Twitchat n'est pas sur la boucle locale, l'Origin n'est donc pas un filtre ici. Le filtre est le **jeton** (secret du
 * Studio, `dev/connection-settings.js`) : dans l'adresse (`?token=`), ou, si la case d'adresse de Twitchat n'accepte qu'un hôte et un port, dans
 * chaque message (`"token": "…"`). Sans jeton valide, un message n'a aucun effet et la raison est dite au Studio. Le Host reste exigé local.
 *
 * Écoute sur `/twitchat-ws` et sur la racine `/` (là où Twitchat se connecte quand on ne lui donne qu'un hôte et un port).
 *
 * @typedef {{ ingest: 'twitchat', authed: boolean }} TwitchatSocketData
 * @typedef {{ data: TwitchatSocketData, send(payload: string): unknown, close(code?: number, reason?: string): unknown }} TwitchatSocket
 */

export const TWITCHAT_PATHS = Object.freeze(['/', '/twitchat-ws']);
/** Un message d'alerte tient en quelques dizaines d'octets : au-delà, ce n'est pas Twitchat. */
export const MAX_MESSAGE_BYTES = 4096;

/** Comparaison sans court-circuit : le temps de réponse ne dit rien du jeton. @param {string} a @param {string} b */
export function sameSecret(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

/** @param {{ intake: ReturnType<typeof import('./event-intake.js').createEventIntake>, getToken: () => Promise<string>, now?: () => number, maxClients?: number }} deps */
export function createTwitchatLink({ intake, getToken, now = Date.now, maxClients = 5 }) {
  /** @type {Set<TwitchatSocket>} */
  const clients = new Set();
  /** @type {{ lastMessageAt: string | null, lastAlertAt: string | null, lastError: string | null }} */
  const activity = { lastMessageAt: null, lastAlertAt: null, lastError: null };

  /** @param {TwitchatSocket} ws @param {unknown} reply */
  const answer = (ws, reply) => { ws.send(JSON.stringify(reply)); };

  /** @param {TwitchatSocket} ws @param {string} error */
  function refuse(ws, error) {
    activity.lastError = error;
    answer(ws, { ok: false, error });
  }

  return {
    /** @param {Request} req @param {URL} url */
    handles: (req, url) => TWITCHAT_PATHS.includes(url.pathname) && req.headers.get('upgrade')?.toLowerCase() === 'websocket',

    /**
     * @param {Request} req
     * @param {URL} url
     * @param {{ upgrade(req: Request, options: { data: TwitchatSocketData }): boolean }} server
     * @returns {Promise<Response | undefined>}
     */
    async accept(req, url, server) {
      if (clients.size >= maxClients) return new Response('trop de connexions', { status: 429 });
      const given = url.searchParams.get('token');
      let authed = false;
      if (given !== null) {
        if (!sameSecret(given, await getToken())) {
          activity.lastError = 'connexion refusée : le jeton de l’adresse est faux (copiez l’adresse depuis Réglages)';
          return new Response('jeton invalide', { status: 401 });
        }
        authed = true;
      }
      return server.upgrade(req, { data: { ingest: 'twitchat', authed } }) ? undefined : new Response('upgrade failed', { status: 500 });
    },

    /** @param {TwitchatSocket} ws */
    open(ws) { clients.add(ws); },

    /** @param {TwitchatSocket} ws */
    close(ws) { clients.delete(ws); },

    /**
     * @param {TwitchatSocket} ws
     * @param {string | Uint8Array} raw
     */
    async message(ws, raw) {
      activity.lastMessageAt = new Date(now()).toISOString();
      const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
      if (new TextEncoder().encode(text).length > MAX_MESSAGE_BYTES) return refuse(ws, `message trop long (${MAX_MESSAGE_BYTES} octets au plus)`);
      /** @type {unknown} */
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return refuse(ws, 'message reçu : ce n’est pas du JSON valide');
      }
      const record = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? /** @type {Record<string, unknown>} */ (parsed) : null;
      if (!ws.data.authed) {
        if (record === null || typeof record.token !== 'string' || !sameSecret(record.token, await getToken())) {
          return refuse(ws, 'message refusé : jeton manquant ou faux (ajoutez ?token=… à l’adresse, ou "token" dans le message)');
        }
        ws.data.authed = true;
      }
      const translated = translateTwitchatMessage(record);
      if (!translated.ok) return refuse(ws, translated.error);
      const published = intake.publish(translated.alert, 'twitchat');
      if (!published.ok) return refuse(ws, published.error);
      activity.lastAlertAt = new Date(now()).toISOString();
      activity.lastError = null;
      answer(ws, { ok: true, type: translated.alert.type });
    },

    /** Coupe toutes les connexions (jeton régénéré : l'ancien ne vaut plus rien). */
    disconnectAll() {
      for (const ws of clients) ws.close(4401, 'jeton régénéré');
      clients.clear();
    },

    view: () => ({ clients: clients.size, ...activity }),
  };
}
