// @ts-check
/**
 * render-transport.js — Ce que la page de rendu sait du serveur d'état : un seul seam.
 *
 * Interface (tout transport la respecte, voir `render-transport.test.js`) :
 *   load(): Promise<StateFile>
 *   subscribe(handlers): () => void
 *     handlers.onState(file)      état complet : à l'abonnement, après chaque reconnexion, et après
 *                                 la modification du preset suivi
 *     handlers.onCurrent(current) nouvel état courant poussé (suivi du fond courant seulement)
 *     handlers.onBranding(b)      contenu du branding (canal ouvert seulement si le handler existe)
 *     handlers.onEvent(event)     événement éphémère de réaction (idem)
 *     handlers.onStatus(status)   'connected' | 'disconnected'
 *     handlers.onError(error)     lecture impossible, message illisible
 *
 * Le rendu ne dépend jamais du transport : un serveur injoignable laisse l'écran inchangé, la
 * reconnexion se fait avec un délai qui double de 1 s à 30 s (OBS peut charger la page avant le serveur).
 *
 * @typedef {{
 *   onState?: (file: any) => void,
 *   onCurrent?: (current: any) => void,
 *   onBranding?: (branding: any) => void,
 *   onEvent?: (event: any) => void,
 *   onStatus?: (status: 'connected' | 'disconnected') => void,
 *   onError?: (error: unknown) => void,
 * }} RenderTransportHandlers
 * @typedef {{ load: () => Promise<any>, subscribe: (handlers: RenderTransportHandlers) => () => void }} RenderTransport
 */

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30000;

/**
 * Transport local : HTTP + WebSocket du serveur d'état du poste.
 * @param {{
 *   baseUrl: string,
 *   presetRef?: string | null,
 *   role?: 'render' | 'studio',
 *   fetchImpl?: typeof fetch,
 *   WebSocketImpl?: typeof WebSocket,
 *   setTimeoutImpl?: (callback: () => void, delay: number) => any,
 *   clearTimeoutImpl?: (handle: any) => void,
 * }} options
 * @returns {RenderTransport}
 */
export function createLocalTransport(options) {
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  const socketBase = baseUrl.replace(/^http/, 'ws');
  const presetRef = options.presetRef ?? null;
  const role = options.role ?? 'render';
  const fetchImpl = options.fetchImpl ?? fetch;
  const WebSocketImpl = options.WebSocketImpl ?? WebSocket;
  const setTimeoutImpl = options.setTimeoutImpl ?? setTimeout;
  const clearTimeoutImpl = options.clearTimeoutImpl ?? clearTimeout;

  async function load() {
    const response = await fetchImpl(`${baseUrl}/state`);
    if (!response.ok) throw new Error(`GET /state → ${response.status}`);
    return response.json();
  }

  return {
    load,
    subscribe(handlers) {
      let stopped = false;
      /** @type {Set<{ close?: () => void }>} */
      const sockets = new Set();
      /** @type {Set<any>} */
      const timers = new Set();

      async function loadState() {
        try {
          const file = await load();
          if (!stopped) handlers.onState?.(file);
        } catch (error) {
          if (!stopped) handlers.onError?.(error);
        }
      }

      /**
       * @param {string} path
       * @param {{ onOpen?: () => void, onClose?: () => void, onMessage: (data: any) => void }} channel
       */
      function openChannel(path, channel) {
        let delay = RECONNECT_MIN_MS;
        function connect() {
          if (stopped) return;
          const socket = new WebSocketImpl(`${socketBase}${path}?role=${role}`);
          sockets.add(socket);
          socket.onopen = () => {
            delay = RECONNECT_MIN_MS;
            channel.onOpen?.();
          };
          socket.onmessage = (event) => {
            if (stopped) return;
            try {
              channel.onMessage(JSON.parse(event.data));
            } catch (error) {
              handlers.onError?.(error);
            }
          };
          socket.onclose = () => {
            sockets.delete(socket);
            if (stopped) return;
            channel.onClose?.();
            const timer = setTimeoutImpl(() => {
              timers.delete(timer);
              connect();
            }, delay);
            timers.add(timer);
            delay = Math.min(delay * 2, RECONNECT_MAX_MS);
          };
        }
        connect();
      }

      openChannel(presetRef === null ? '/state-ws' : '/presets-ws', {
        onOpen() {
          handlers.onStatus?.('connected');
          loadState(); // resynchronise ce qui a changé pendant la déconnexion
        },
        onClose: () => handlers.onStatus?.('disconnected'),
        onMessage(data) {
          if (presetRef === null) handlers.onCurrent?.(data);
          else if (data.id === presetRef || data.name === presetRef) loadState();
        },
      });
      if (handlers.onBranding !== undefined) {
        openChannel('/branding-ws', { onMessage: (data) => handlers.onBranding?.(data) });
      }
      if (handlers.onEvent !== undefined) {
        openChannel('/event-ws', { onMessage: (data) => handlers.onEvent?.(data) });
      }

      return () => {
        stopped = true;
        for (const timer of timers) clearTimeoutImpl(timer);
        timers.clear();
        for (const socket of sockets) socket.close?.();
        sockets.clear();
      };
    },
  };
}

const CACHE_KEY = 'overlay:render-state';

/**
 * Enveloppe qui rend le dernier état connu avant la réponse du serveur, puis réconcilie.
 * Les événements éphémères ne sont jamais mémorisés ; un stockage indisponible ou corrompu est ignoré.
 * @param {RenderTransport} inner
 * @param {Pick<Storage, 'getItem' | 'setItem'>} storage
 * @param {string} [key]
 * @returns {RenderTransport}
 */
export function createCachedTransport(inner, storage, key = CACHE_KEY) {
  function read() {
    try {
      const raw = storage.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** @param {any} file */
  function write(file) {
    try {
      storage.setItem(key, JSON.stringify(file));
    } catch {
      // Quota, navigation privée : le rendu n'en dépend pas.
    }
  }

  return {
    async load() {
      try {
        const file = await inner.load();
        write(file);
        return file;
      } catch (error) {
        const cached = read();
        if (cached === null) throw error;
        return cached;
      }
    },
    subscribe(handlers) {
      let known = read();
      /** @param {Record<string, unknown>} patch */
      function remember(patch) {
        if (known === null) return;
        known = { ...known, ...patch };
        write(known);
      }

      if (known !== null) handlers.onState?.(known);
      return inner.subscribe({
        ...handlers,
        onState(file) {
          known = file;
          write(file);
          handlers.onState?.(file);
        },
        onCurrent: handlers.onCurrent === undefined ? undefined : (current) => {
          remember({ current });
          handlers.onCurrent?.(current);
        },
        onBranding: handlers.onBranding === undefined ? undefined : (branding) => {
          remember({ branding });
          handlers.onBranding?.(branding);
        },
      });
    },
  };
}
