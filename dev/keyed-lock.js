// @ts-check
/**
 * dev/keyed-lock.js — Sérialisation en mémoire d'opérations concurrentes sur une même ressource
 * (fichier, clé), à l'intérieur d'un seul process.
 *
 * Un seul process ne suffit pas à éliminer une race sur un read-modify-write : un handler `async`
 * qui traverse un `await` (lecture disque) peut être interléavé par une autre requête sur la MÊME
 * ressource. Une chaîne de promesses par clé résout ça sans verrou fichier.
 *
 * Extrait ici (2026-07-06, voir docs/specs/scene-history-protocol.md §Concurrence d'accès) après
 * 3 occurrences indépendantes du même motif : `manifest.json` (scene-data-server.js), historique de
 * scène (scene-history-store.js), fichier de scène (scene-data-server.js `/save-placement`),
 * `components/DotGridAnimated.js` (tuner-server.js).
 *
 * Ne protège PAS deux process Bun distincts écrivant le même fichier — pour ce cas, la solution est
 * un unique process propriétaire de la ressource (voir docs/specs/scene-history-protocol.md), pas ce
 * module.
 */

/**
 * @returns {<T>(key: string, fn: () => Promise<T>) => Promise<T>}
 */
export function createKeyedLock() {
  /** @type {Map<string, Promise<unknown>>} */
  const chains = new Map();

  return function withLock(key, fn) {
    const previous = chains.get(key) ?? Promise.resolve();
    const result = previous.then(fn, fn);
    chains.set(key, result.catch(() => {})); // une opération en échec ne bloque pas la suivante
    return result;
  };
}
