// @ts-check
/**
 * dev/port-check.js — Vérification préflight qu'un port TCP est libre avant de lancer un serveur.
 *
 * Utilisé par `start-stream.js`/`start-dev.js` pour détecter un port déjà pris (typiquement : une
 * instance précédente encore ouverte) AVANT de spawn les enfants, et donner un message clair et
 * unique au lieu des piles d'erreur `EADDRINUSE` brutes de chaque serveur Bun (root cause du
 * symptôme « la fenêtre s'ouvre et se referme immédiatement », owner 2026-07-10 — le process
 * parent n'a plus rien à faire une fois tous ses enfants morts au démarrage, donc il se termine
 * silencieusement).
 *
 * Même mécanisme que les serveurs réels (`Bun.serve`) plutôt qu'un simple ping applicatif : ça
 * détecte exactement le conflit qu'ils rencontreraient.
 */

/**
 * @param {number} port
 * @returns {boolean} true si le port est libre (peut être écouté)
 */
export function isPortFree(port) {
  try {
    const server = Bun.serve({ port, fetch: () => new Response() });
    server.stop(true);
    return true;
  } catch {
    return false;
  }
}

/**
 * Vérifie une liste de `{ name, port }`, retourne ceux déjà occupés.
 * @param {{ name: string, port: number }[]} targets
 * @returns {{ name: string, port: number }[]}
 */
export function findBusyPorts(targets) {
  return targets.filter((t) => !isPortFree(t.port));
}

/**
 * Trouve le PID qui écoute sur un port TCP donné (Windows, via `netstat -ano`).
 * @param {number} port
 * @returns {number | null}
 */
function findPidOnPort(port) {
  const result = Bun.spawnSync(['netstat', '-ano', '-p', 'TCP']);
  const output = result.stdout.toString();
  for (const line of output.split('\n')) {
    const match = line.match(/^\s*TCP\s+\S*:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
    if (match && Number(match[1]) === port) return Number(match[2]);
  }
  return null;
}

/**
 * @param {number} pid
 * @returns {boolean} true si le process portant ce PID est bun.exe
 */
function isBunProcess(pid) {
  const result = Bun.spawnSync(['tasklist', '/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
  return result.stdout.toString().toLowerCase().startsWith('"bun.exe"');
}

/**
 * Tue les process `bun.exe` zombies occupant les ports ciblés — jamais un process d'un autre nom
 * (sécurité : ne libère que ce que nos propres serveurs auraient pu laisser tourner).
 * @param {{ name: string, port: number }[]} targets
 * @returns {{ name: string, port: number }[]} ceux effectivement libérés
 */
export function freeStaleBunPorts(targets) {
  const freed = [];
  for (const target of targets) {
    if (isPortFree(target.port)) continue;
    const pid = findPidOnPort(target.port);
    if (pid === null || !isBunProcess(pid)) continue;
    Bun.spawnSync(['taskkill', '/F', '/PID', String(pid)]);
    freed.push(target);
  }
  return freed;
}
