// @ts-check
/**
 * dev/branding-drag.js — Position du bloc de branding à partir d'un pointeur.
 *
 * Logique pure : la conversion pixel → pourcentage se teste sans DOM ni souris. Le contrôleur ne
 * fait que lui passer des rectangles et des coordonnées.
 * Voir docs/specs/background-branding-layer.md.
 */

/** @param {number} value */
function clampPercent(value) {
  return Math.min(100, Math.max(0, value));
}

/**
 * Position en pourcentage du canvas d'aperçu, arrondie au dixième — un pourcentage à 12 décimales
 * n'apporte rien et rend le réglage illisible dans le fichier d'état.
 *
 * @param {{ pointerX: number, pointerY: number, rect: { left: number, top: number, width: number, height: number } }} input
 * @returns {{ x: number, y: number }}
 */
export function pointerToPercent({ pointerX, pointerY, rect }) {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };

  const x = ((pointerX - rect.left) / rect.width) * 100;
  const y = ((pointerY - rect.top) / rect.height) * 100;
  return {
    x: Math.round(clampPercent(x) * 10) / 10,
    y: Math.round(clampPercent(y) * 10) / 10,
  };
}
