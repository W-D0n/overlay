// @ts-check

export class BackgroundStateClientError extends Error {
  /**
   * @param {string} operation
   * @param {string} message
   * @param {number | null} [status]
   */
  constructor(operation, message, status = null) {
    super(message);
    this.name = 'BackgroundStateClientError';
    this.operation = operation;
    this.status = status;
  }
}

/**
 * Client unique du protocole HTTP du serveur d’état du tuner.
 *
 * @param {{
 *   baseUrl: string,
 *   fetchImpl?: typeof fetch,
 *   WebSocketImpl?: typeof WebSocket,
 *   setTimeoutImpl?: typeof setTimeout,
 *   clearTimeoutImpl?: typeof clearTimeout,
 * }} options
 */
export function createBackgroundStateClient(options) {
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const WebSocketImpl = options.WebSocketImpl ?? WebSocket;
  const setTimeoutImpl = options.setTimeoutImpl ?? setTimeout;
  const clearTimeoutImpl = options.clearTimeoutImpl ?? clearTimeout;

  /**
   * @param {string} operation
   * @param {unknown} [body]
   */
  async function request(operation, body) {
    const init = body === undefined
      ? { method: 'GET' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        };

    let response;
    try {
      response = await fetchImpl(`${baseUrl}/${operation}`, init);
    } catch (error) {
      throw new BackgroundStateClientError(
        operation,
        error instanceof Error ? error.message : String(error),
      );
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // Une réponse vide reste valide pour une commande réussie.
    }

    if (!response.ok) {
      const message = payload && typeof payload.error === 'string'
        ? payload.error
        : `HTTP ${response.status}`;
      throw new BackgroundStateClientError(operation, message, response.status);
    }
    return payload;
  }

  return {
    readState() {
      return request('state');
    },
    /** @param {{ component: string | null, options: Record<string, unknown> }} current */
    saveCurrent(current) {
      return request('state', { current });
    },
    /** @param {Record<string, unknown>} preset */
    savePreset(preset) {
      return request('save-preset', preset);
    },
    /** @param {string} id @param {string} name */
    renamePreset(id, name) {
      return request('rename-preset', { id, name });
    },
    /** @param {string} id */
    duplicatePreset(id) {
      return request('duplicate-preset', { id });
    },
    /** @param {string} id */
    deletePreset(id) {
      return request('delete-preset', { id });
    },
    /** @param {string} bundle */
    previewPresetImport(bundle) {
      return request('preview-import', { bundle });
    },
    /** @param {string} bundle @param {string} expectedRevision */
    importPresets(bundle, expectedRevision) {
      return request('import-presets', { bundle, expectedRevision });
    },
    /**
     * @param {{
     *   onCurrent: (current: unknown) => void,
     *   onPresets: () => void,
     *   onError?: (error: unknown) => void,
     * }} listeners
     */
    subscribe(listeners) {
      let stopped = false;
      /** @type {WebSocket[]} */
      const sockets = [];
      /** @type {ReturnType<typeof setTimeout>[]} */
      const timers = [];
      const websocketBaseUrl = baseUrl.replace(/^http/, 'ws');

      /**
       * @param {string} path
       * @param {(payload: unknown) => void} onMessage
       * @param {number} [delayMs]
       */
      function connect(path, onMessage, delayMs = 1000) {
        if (stopped) return;
        const socket = new WebSocketImpl(`${websocketBaseUrl}/${path}`);
        sockets.push(socket);
        socket.onopen = () => { delayMs = 1000; };
        socket.onmessage = (event) => {
          try {
            onMessage(JSON.parse(String(event.data)));
          } catch (error) {
            listeners.onError?.(error);
          }
        };
        socket.onclose = () => {
          if (stopped) return;
          const timer = setTimeoutImpl(
            () => connect(path, onMessage, Math.min(delayMs * 2, 30000)),
            delayMs,
          );
          timers.push(timer);
        };
      }

      connect('state-ws', listeners.onCurrent);
      connect('presets-ws', listeners.onPresets);

      return () => {
        stopped = true;
        for (const timer of timers) clearTimeoutImpl(timer);
        for (const socket of sockets) socket.close();
      };
    },
  };
}
