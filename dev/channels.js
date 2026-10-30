// @ts-check
/**
 * dev/channels.js — Canaux temps réel nommés : abonnement, diffusion, comptage.
 *
 * Un seul mécanisme pour tous les canaux. Le chemin WebSocket choisit le canal (`channelForPath`) ; un chemin ou un
 * canal inconnu est refusé, jamais rangé dans un autre canal.
 *
 * `role` : une page de rendu (OBS) s'annonce par `?role=render` ; le Studio ne s'annonce pas.
 *
 * @typedef {'state' | 'presets' | 'event' | 'branding' | 'studio'} ChannelName
 * @typedef {{ channel: ChannelName, role: 'render' | 'studio' }} SocketData
 * @typedef {{ data: SocketData, send(payload: string): unknown }} ChannelSocket
 */

/** @type {Readonly<Record<string, ChannelName>>} */
export const CHANNEL_PATHS = Object.freeze({
  '/state-ws': 'state',
  '/presets-ws': 'presets',
  '/event-ws': 'event',
  '/branding-ws': 'branding',
  '/studio-ws': 'studio',
});

/**
 * @param {string} pathname
 * @returns {ChannelName | null}
 */
export function channelForPath(pathname) {
  return CHANNEL_PATHS[pathname] ?? null;
}

export function createChannels() {
  /** @type {Map<ChannelName, Set<ChannelSocket>>} */
  const members = new Map(Object.values(CHANNEL_PATHS).map((name) => [name, new Set()]));

  /** @param {ChannelName} name */
  function setOf(name) {
    const set = members.get(name);
    if (set === undefined) throw new Error(`canal inconnu : ${String(name)}`);
    return set;
  }

  return {
    /** @param {ChannelSocket} socket */
    add(socket) {
      setOf(socket.data.channel).add(socket);
    },
    /** @param {ChannelSocket} socket */
    remove(socket) {
      for (const set of members.values()) set.delete(socket);
    },
    /**
     * @param {ChannelName} name
     * @param {unknown} value sérialisé en JSON
     */
    broadcast(name, value) {
      const payload = JSON.stringify(value);
      for (const socket of setOf(name)) socket.send(payload);
    },
    /**
     * @param {ChannelName} name
     * @param {'render' | 'studio'} [role] sans rôle : tous les abonnés
     */
    count(name, role) {
      let total = 0;
      for (const socket of setOf(name)) if (role === undefined || socket.data.role === role) total += 1;
      return total;
    },
  };
}
