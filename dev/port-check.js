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
