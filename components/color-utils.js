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

/**
 * Décale la teinte (HSL) d'un RGB de `deltaDeg` degrés, saturation/luminosité inchangées.
 * Pure — pas de DOM, testable directement (contrairement à `resolveColor`).
 * @param {[number, number, number]} rgb
 * @param {number} deltaDeg
 * @returns {[number, number, number]}
 */
export function hueShiftRgb([r, g, b], deltaDeg) {
  const rN = r / 255, gN = g / 255, bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return [r, g, b]; // achromatique — pas de teinte à décaler

  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  switch (max) {
    case rN: h = ((gN - bN) / d) % 6; break;
    case gN: h = (bN - rN) / d + 2; break;
    default: h = (rN - gN) / d + 4; break;
  }
  // Normalisation modulo positive : le `%` de JS garde le signe de l'opérande gauche, donc un
  // deltaDeg très négatif (< -360) laisserait `h` négatif après un seul `+360` (bug constaté :
  // delta -720 devait être équivalent à 0 mais tombait dans le mauvais bras de reconstruction RGB).
  h = (((h * 60 + deltaDeg) % 360) + 360) % 360;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r1, g1, b1] = [0, 0, 0];
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

/**
 * Précalcule `hueShiftRgb(rgb, deg)` pour chaque degré entier de `-maxDeg` à `+maxDeg` (résolution
 * suffisante à l'œil, pas besoin de précision infra-degré). Évite de refaire la conversion HSL
 * complète pour chaque point à chaque frame (`DotGridAnimated` `colorMode: 'noise'`, des milliers
 * de points × 60fps) — coût CPU non négligeable en contexte stream où la ressource est déjà
 * partagée avec OBS/encodage/jeu (feedback owner 2026-07-10). `rgb` est fixe pour la durée de vie
 * du composant appelant (jamais muté après init) : un seul calcul de la table suffit.
 * @param {[number, number, number]} rgb
 * @param {number} maxDeg
 * @returns {[number, number, number][]} index 0 = -maxDeg, index maxDeg = 0, index 2*maxDeg = +maxDeg
 */
export function buildHueShiftLUT(rgb, maxDeg) {
  const table = [];
  for (let deg = -maxDeg; deg <= maxDeg; deg++) {
    table.push(hueShiftRgb(rgb, deg));
  }
  return table;
}
