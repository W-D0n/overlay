// @ts-check
/**
 * dev/stop-servers.js — Arrête les serveurs du projet, dans le bon ordre (docs/specs/controle-processus.md).
 *
 * Tuer un serveur enfant ne l'arrête pas : le lanceur qui le supervise le relance (`dev/supervisor.js`).
 * L'ordre est donc : 1) demander l'arrêt au lanceur par la route de contrôle ; 2) à défaut, arrêter le
 * lanceur lui-même, puis ses enfants ; 3) un port tenu par autre chose qu'un `bun.exe` n'est jamais
 * touché, il est nommé. Toutes les dépendances sont injectées : l'ordre se teste sans processus réel.
 *
 * @typedef {{ name: string, port: number }} Target
 * @typedef {{
 *   requestStop: () => Promise<boolean>,
 *   isPortFree: (port: number) => boolean,
 *   listLaunchers: (holderPids: number[]) => number[],
 *   pidOnPort: (port: number) => number | null,
 *   processName: (pid: number) => string | null,
 *   kill: (pid: number) => void,
 *   wait: (ms: number) => Promise<void>,
 * }} StopDeps
 * @typedef {{ target: Target, pid: number, processName: string | null }} Holder
 * @typedef {{ released: Target[], foreign: Holder[], stillBusy: Target[] }} StopReport
 */

const POLL_MS = 150;

/**
 * @param {Target[]} targets
 * @param {StopDeps} deps
 * @param {number} timeoutMs
 * @returns {Promise<Target[]>} les cibles encore occupées
 */
async function waitUntilFree(targets, deps, timeoutMs) {
  let waited = 0;
  for (;;) {
    const busy = targets.filter(({ port }) => !deps.isPortFree(port));
    if (busy.length === 0 || waited >= timeoutMs) return busy;
    await deps.wait(POLL_MS);
    waited += POLL_MS;
  }
}

/**
 * @param {Target[]} targets
 * @param {StopDeps} deps
 * @returns {Promise<StopReport>}
 */
export async function stopServers(targets, deps) {
  const initiallyBusy = targets.filter(({ port }) => !deps.isPortFree(port));
  if (initiallyBusy.length === 0) return { released: [], foreign: [], stillBusy: [] };

  // 1. Arrêt demandé au lanceur : ses enfants sortent avec le code 0 et ne sont pas relancés.
  await deps.requestStop().catch(() => false);
  let busy = await waitUntilFree(initiallyBusy, deps, 4000);

  // 2. Sans réponse du lanceur : le lanceur d'abord (sinon il relance ce qu'on tue), puis les enfants.
  /** @type {Holder[]} */
  const foreign = [];
  if (busy.length > 0) {
    // Seuls les lanceurs parents d'un serveur de CES ports sont visés : jamais un autre lanceur du poste.
    const holderPids = busy.map(({ port }) => deps.pidOnPort(port)).filter((pid) => pid !== null);
    for (const pid of deps.listLaunchers(/** @type {number[]} */ (holderPids))) deps.kill(pid);
    for (const target of busy) {
      const pid = deps.pidOnPort(target.port);
      if (pid === null) continue;
      const name = deps.processName(pid);
      if (name !== null && name.toLowerCase() === 'bun.exe') deps.kill(pid);
      else foreign.push({ target, pid, processName: name });
    }
    busy = await waitUntilFree(busy, deps, 3000);
  }

  const stillBusy = busy;
  const released = initiallyBusy.filter(({ port }) => !stillBusy.some((target) => target.port === port));
  return { released, foreign: foreign.filter(({ target }) => stillBusy.includes(target)), stillBusy };
}
