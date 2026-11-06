// @ts-check
/**
 * render-reference.js — Résolution de référence de la source OBS, source unique.
 *
 * C'est la taille de la Browser Source que le Studio imite (aperçu, vignettes) et à laquelle les
 * tailles en pixels des réglages se rapportent (branding). Aujourd'hui 1920×1080 ; si la source passe en
 * 1440p, cette valeur est la seule à changer. La page de rendu, elle, épouse toujours sa source :
 * aucune dimension n'y est figée.
 */
export const RENDER_REFERENCE = Object.freeze({ width: 1920, height: 1080 });

/**
 * Rapport entre la hauteur réelle d'une surface de rendu et la hauteur de référence. Les effets sont
 * dessinés dans un repère « de référence » (leurs tailles en pixels valent pour cette hauteur) ; cette
 * échelle les adapte à la source réelle, quelle que soit sa résolution.
 * @param {number} height
 * @returns {number}
 */
export function referenceScale(height) {
  return Number.isFinite(height) && height > 0 ? height / RENDER_REFERENCE.height : 1;
}
