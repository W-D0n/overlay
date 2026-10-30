// @ts-check
import { canonicalBackgroundState } from './background-state-format.js';

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
   * @param {Record<string, string>} [extraHeaders]
   */
  async function request(operation, body, extraHeaders = {}) {
    const init = body === undefined
      ? { method: 'GET' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...extraHeaders },
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
    /** L'état lu est toujours sous forme neutre, même si le serveur n'a pas encore migré son fichier. */
    async readState() {
      return canonicalBackgroundState(await request('state'));
    },
    /**
     * Demande au lanceur de relancer ou d'arrêter les serveurs. L'en-tête personnalisé est exigé par le
     * serveur : il force une requête préalable CORS qu'une page étrangère ne passe pas.
     * @param {'restart' | 'stop'} action
     */
    control(action) {
      return request(`control/${action}`, {}, { 'X-Overlay-Control': '1' });
    },
    /** Faits du diagnostic : état d'OBS, sources navigateur et scènes, pages de rendu, table scène → preset. */
    readDiagnostics() {
      return request('diagnostics');
    },
    /** @returns {Promise<{ renderPages: number }>} */
    readLiveStatus() {
      return request('live-status');
    },
    readObsStatus() {
      return request('obs-status');
    },
    /** États qui ont quitté l'antenne, le plus récent d'abord. @returns {Promise<import('./state-wire.js').WireHistoryEntry[]>} */
    async readHistory() {
      return (await request('history')).history;
    },
    /** Remet à l'antenne l'état de l'historique daté `at`. @param {string} at */
    rollback(at) {
      return request('rollback', { at });
    },
    /** Réglages non enregistrés, par identifiant de preset. @returns {Promise<Record<string, import('./preset-draft-sync.js').DraftEntry>>} */
    async readDrafts() {
      return (await request('drafts')).drafts;
    },
    /** @param {string} presetId @param {unknown} state */
    saveDraft(presetId, state) {
      return request('draft', { presetId, state });
    },
    /** @param {string} presetId */
    discardDraft(presetId) {
      return request('discard-draft', { presetId });
    },
    /** @param {Record<string, string>} sceneMap */
    saveSceneMap(sceneMap) {
      return request('scene-map', { sceneMap });
    },
    /** @param {unknown} branding */
    saveBranding(branding) {
      return request('branding', { branding });
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
    /** @param {string} type */
    sendEvent(type) {
      return request('event', { type });
    },
    /**
     * @param {{
     *   onCurrent: (current: unknown) => void,
     *   onPresets: () => void,
     *   onEvent?: (event: unknown) => void,
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
      if (listeners.onEvent) connect('event-ws', listeners.onEvent);

      return () => {
        stopped = true;
        for (const timer of timers) clearTimeoutImpl(timer);
        for (const socket of sockets) socket.close();
      };
    },
  };
}
