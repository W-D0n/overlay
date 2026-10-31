// @ts-check
import { createObsSceneClient } from './obs-scene-client.js';
import { inspectObs } from './obs-inspector.js';
import { errorMessage } from './error-message.js';

/**
 * dev/obs-connection.js — La connexion du serveur d'état à OBS, reconfigurable sans relancer le serveur.
 *
 * Elle possède le client OBS (`obs-scene-client.js`) et son état (connecté, raison, scènes). `restart()` ferme le client en place
 * et en ouvre un neuf avec les réglages du moment : changer le mot de passe dans le Studio suffit, y compris après un « mot de passe
 * refusé » (le client, lui, ne réessaie jamais seul un refus). Sans mot de passe, aucun client n'est ouvert : le serveur se comporte
 * comme avant ③. Un redémarrage lancé pendant que le précédent lit encore les réglages remplace celui-ci : seul le dernier compte.
 *
 * @typedef {{ connected: boolean, reason: string | null, scenes: string[], activeScene: string | null }} ObsStatus
 *
 * @param {{
 *   resolve: () => Promise<{ url: string, password: string }>,
 *   onSceneChange: (sceneName: string) => void,
 *   createClient?: typeof createObsSceneClient,
 *   log?: Pick<Console, 'info' | 'warn'>,
 * }} deps
 */
export function createObsConnection({ resolve, onSceneChange, createClient = createObsSceneClient, log = console }) {
  /** @type {ObsStatus} */
  const status = { connected: false, reason: null, scenes: [], activeScene: null };
  /** @type {ReturnType<typeof createObsSceneClient> | null} */
  let client = null;
  let generation = 0;
  let configured = false;

  function reset() {
    status.connected = false;
    status.reason = null;
    status.scenes = [];
    status.activeScene = null;
  }

  async function restart() {
    const mine = ++generation;
    client?.stop();
    client = null;
    reset();
    let settings;
    try {
      settings = await resolve();
    } catch (error) {
      if (mine !== generation) return;
      configured = false;
      status.reason = 'not-configured';
      log.warn(`[obs-connection] réglages illisibles : ${errorMessage(error)}`);
      return;
    }
    if (mine !== generation) return;
    configured = settings.password !== '';
    if (!configured) {
      status.reason = 'not-configured';
      log.info('[obs-connection] aucun mot de passe OBS — mapping scène → preset désactivé');
      return;
    }
    status.reason = 'connecting';
    client = createClient({
      url: settings.url,
      password: settings.password,
      onSceneChange: (sceneName) => { if (mine === generation) { status.activeScene = sceneName; onSceneChange(sceneName); } },
      onScenes: (scenes) => { if (mine === generation) status.scenes = scenes; },
      onActiveScene: (sceneName) => { if (mine === generation) status.activeScene = sceneName; },
      onStatus: ({ connected, reason }) => {
        if (mine !== generation) return;
        status.connected = connected;
        status.reason = reason;
        if (!connected) status.activeScene = null;
      },
    });
  }

  /** @param {string} requestType @param {Record<string, unknown>} [requestData] */
  const request = (requestType, requestData) => {
    if (client === null) return Promise.reject(new Error('OBS non connecté'));
    return client.request(requestType, requestData);
  };

  return {
    restart,
    status: () => status,
    get configured() { return configured; },
    inspect: () => inspectObs(request),
    stop() {
      generation += 1;
      client?.stop();
      client = null;
    },
  };
}
