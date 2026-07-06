// @ts-check
/**
 * color-utils.js — Résolution de couleur CSS → RGB pour usage canvas (Track B).
 *
 * `strokeStyle`/`fillStyle` d'un canvas n'acceptent pas `var(--token)` : plusieurs effets de fond
 * (Rain, Bubble, Fireflies) acceptent une couleur en option référencée par token CSS — extrait ici
 * dès la 3ᵉ occurrence identique (règle des trois, CLAUDE.md).
 */

/**
 * Résout une couleur CSS (token `var(--x)` ou valeur brute) en triplet RGB. Nécessite un noeud
 * connecté au document pour que la cascade résolve la variable.
 * @param {string} value
 * @returns {[number, number, number]}
 */
export function resolveColor(value) {
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;visibility:hidden;color:${value};`;
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  const m = rgb.match(/\d+/g) ?? ['200', '185', '122'];
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}
