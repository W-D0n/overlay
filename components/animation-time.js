// @ts-check

/**
 * Delta-temps borné pour les animations canvas. `null` représente la première frame. La borne
 * évite qu'un onglet suspendu plusieurs secondes fasse traverser tout l'écran aux particules au
 * retour.
 *
 * @param {number | null} previousTimestamp
 * @param {number} timestamp
 * @param {number} [maxDelta]
 * @returns {number} secondes
 */
export function frameDeltaSeconds(previousTimestamp, timestamp, maxDelta = 0.1) {
  if (previousTimestamp === null) return 0;
  return Math.min(maxDelta, Math.max(0, (timestamp - previousTimestamp) / 1000));
}

/**
 * Convertit une probabilité historiquement exprimée « par frame à 60 fps » en probabilité pour un
 * delta réel. Préserve le comportement moyen à 60 fps tout en restant stable à 30/120 fps.
 *
 * @param {number} chancePerFrame
 * @param {number} deltaSeconds
 * @param {number} [referenceFps]
 * @returns {number}
 */
export function chanceForDelta(chancePerFrame, deltaSeconds, referenceFps = 60) {
  const chance = Math.min(1, Math.max(0, chancePerFrame));
  const frameEquivalent = Math.max(0, deltaSeconds) * referenceFps;
  return 1 - (1 - chance) ** frameEquivalent;
}
