// @ts-check
/**
 * dev/supervisor.js — Supervision des serveurs du live par code de sortie (docs/specs/controle-processus.md).
 *
 * - `0`  : arrêt demandé (par le Studio ou par l'utilisateur) → tout s'arrête.
 * - `75` : redémarrage demandé → tous les serveurs sont relancés, le code rechargé.
 * - autre : incident → ce serveur est relancé, au plus `limit.count` fois en `limit.windowMs`, puis tout
 *   s'arrête : une boucle de relance pendant un live serait pire qu'un arrêt net.
 *
 * Le lancement d'un processus est injecté (`spawn`) : la supervision se teste sans processus réel.
 */

export const EXIT_STOP = 0;
export const EXIT_RESTART = 75;
/** Variable posée sur les enfants : un serveur lancé hors lanceur ne peut pas obéir à un ordre d'arrêt. */
export const SUPERVISED_ENV = 'OVERLAY_SUPERVISED';

/**
 * @typedef {{ name: string, cmd: string[], port: number }} ServerSpec
 * @typedef {{ pid?: number, kill: () => void, exited: Promise<number> }} ServerProcess
 */

/**
 * @param {{
 *   servers: ServerSpec[],
 *   spawn: (server: ServerSpec) => ServerProcess,
 *   log?: (message: string) => void,
 *   onExit?: (code: number) => void,
 *   limit?: { count: number, windowMs: number },
 *   now?: () => number,
 * }} input
 */
export function createSupervisor(input) {
  const log = input.log ?? (() => {});
  const onExit = input.onExit ?? (() => {});
  const limit = input.limit ?? { count: 3, windowMs: 60_000 };
  const now = input.now ?? Date.now;

  /** @type {Map<string, ServerProcess>} */
  const running = new Map();
  /** @type {Map<string, number[]>} */
  const incidents = new Map();
  let generation = 0;
  let finished = false;

  /** @param {ServerSpec} server */
  function launch(server) {
    const owned = generation;
    const child = input.spawn(server);
    running.set(server.name, child);
    log(`${server.name} lancé${child.pid === undefined ? '' : ` (pid ${child.pid})`}`);
    child.exited.then((code) => handleExit(server, owned, child, code));
  }

  /**
   * @param {ServerSpec} server
   * @param {number} owned
   * @param {ServerProcess} child
   * @param {number} code
   */
  function handleExit(server, owned, child, code) {
    // Une sortie provoquée par notre propre arrêt ou redémarrage n'est pas un événement à traiter.
    if (finished || owned !== generation || running.get(server.name) !== child) return;
    running.delete(server.name);

    if (code === EXIT_STOP) {
      log(`${server.name} demande l'arrêt`);
      finish(EXIT_STOP);
    } else if (code === EXIT_RESTART) {
      log(`${server.name} demande le redémarrage`);
      restartAll();
    } else {
      relaunchAfterIncident(server, code);
    }
  }

  /** @param {ServerSpec} server @param {number} code */
  function relaunchAfterIncident(server, code) {
    const recent = (incidents.get(server.name) ?? []).filter((time) => now() - time < limit.windowMs);
    recent.push(now());
    incidents.set(server.name, recent);
    if (recent.length > limit.count) {
      log(`${server.name} s'arrête de façon répétée (code ${code}) — arrêt de tous les serveurs`);
      finish(1);
      return;
    }
    log(`${server.name} s'est arrêté (code ${code}) — relance ${recent.length}/${limit.count}`);
    launch(server);
  }

  /** Arrête les enfants et attend leur sortie : un port n'est libre qu'une fois le processus parti. */
  function killAll() {
    generation += 1;
    const departures = [...running.values()].map((child) => child.exited.catch(() => 0));
    for (const child of running.values()) child.kill();
    running.clear();
    return Promise.all(departures);
  }

  async function restartAll() {
    await killAll();
    if (finished) return;
    for (const server of input.servers) launch(server);
  }

  /** @param {number} code */
  function finish(code) {
    if (finished) return;
    finished = true;
    killAll();
    onExit(code);
  }

  return {
    start() {
      for (const server of input.servers) launch(server);
    },
    /** Arrêt demandé de l'extérieur (Ctrl+C) : aucun enfant n'est relancé. */
    stop() {
      finish(EXIT_STOP);
    },
    restart: restartAll,
  };
}
