// @ts-check
/**
 * placement-resolve.js — Résolution `Placement` → style CSS (logique pure).
 *
 * Aucun effet de bord : ni DOM, ni réseau, ni temps. Zéro dépendance ; consommé par
 * `scene-runtime.js` (application effective au montage) et testé isolément (AD-1).
 * Voir docs/specs/scene-placement-protocol.md.
 */

/**
 * Résoudre un `Placement` en propriétés de style CSS à appliquer en inline.
 * `position: absolute` toujours inclus — un `Placement` n'a de sens que positionné
 * absolument dans le canvas 1920×1080 (cohérent avec `.scene { position: absolute; inset: 0 }`).
 *
 * @param {import('./types.js').Placement} placement
 * @returns {Record<string, string>}
 */
export function resolvePlacementStyle(placement) {
  /** @type {Record<string, string>} */
  const style = {
    position: 'absolute',
    left: `${placement.x}px`,
    top: `${placement.y}px`,
  };
  if (placement.width !== undefined) style.width = `${placement.width}px`;
  if (placement.height !== undefined) style.height = `${placement.height}px`;
  return style;
}
