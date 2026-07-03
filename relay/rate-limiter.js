// @ts-check
/**
 * relay/rate-limiter.js — Limiteur de débit à fenêtre glissante (logique pure).
 *
 * Aucun effet de bord réseau/DOM ; le temps est injecté (`now`), jamais lu depuis `Date.now()`
 * en interne — déterministe et testable (AD-1). Seul l'état interne (compteur par clé) est mutable,
 * encapsulé dans la closure retournée par `createRateLimiter`.
 */

/**
 * @param {{ windowMs: number, maxRequests: number }} config
 * @returns {{ allow: (key: string, now: number) => boolean }}
 */
export function createRateLimiter({ windowMs, maxRequests }) {
  /** @type {Map<string, number[]>} */
  const hitsByKey = new Map();

  return {
    /**
     * @param {string} key - Identifiant du client (ex. IP)
     * @param {number} now - Timestamp courant en ms (injecté, jamais `Date.now()` ici)
     * @returns {boolean} `true` si la requête est autorisée, `false` si la limite est atteinte
     */
    allow(key, now) {
      const recentHits = (hitsByKey.get(key) ?? []).filter((t) => now - t < windowMs);

      if (recentHits.length >= maxRequests) {
        hitsByKey.set(key, recentHits);
        return false;
      }

      recentHits.push(now);
      hitsByKey.set(key, recentHits);
      return true;
    },
  };
}
