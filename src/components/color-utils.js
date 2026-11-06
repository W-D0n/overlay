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
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return parseCssColor(resolved) ?? parseCssColor(value) ?? [200, 185, 122];
}

/**
 * Parse les sérialisations utiles au tuner/canvas. Chromium peut conserver `oklch(...)` dans le
 * style calculé au lieu de le convertir en `rgb(...)` : le parser explicite évite de lire L/C/H
 * comme si c'étaient des canaux RGB.
 * @param {string} value
 * @returns {[number, number, number] | null}
 */
export function parseCssColor(value) {
  const input = value.trim();

  const hex = input.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const expanded = hex[1].length === 3
      ? [...hex[1]].map((char) => char + char).join('')
      : hex[1];
    return [
      Number.parseInt(expanded.slice(0, 2), 16),
      Number.parseInt(expanded.slice(2, 4), 16),
      Number.parseInt(expanded.slice(4, 6), 16),
    ];
  }

  const rgb = input.match(/^rgba?\((.+)\)$/i);
  if (rgb) {
    const channels = rgb[1].split(/[,\s/]+/).filter(Boolean).slice(0, 3);
    if (channels.length === 3) {
      const parsed = channels.map((channel) => channel.endsWith('%')
        ? Number.parseFloat(channel) * 2.55
        : Number.parseFloat(channel));
      if (parsed.every(Number.isFinite)) return /** @type {[number,number,number]} */ (parsed.map(toByte));
    }
  }

  const oklch = input.match(
    /^oklch\(\s*([+-]?(?:\d+\.?\d*|\.\d+)%?)\s+([+-]?(?:\d+\.?\d*|\.\d+))\s+([+-]?(?:\d+\.?\d*|\.\d+))(?:deg)?(?:\s*\/[^)]+)?\s*\)$/i,
  );
  if (oklch) {
    const lightness = oklch[1].endsWith('%')
      ? Number.parseFloat(oklch[1]) / 100
      : Number.parseFloat(oklch[1]);
    return oklchToRgb(lightness, Number.parseFloat(oklch[2]), Number.parseFloat(oklch[3]));
  }

  const srgb = input.match(/^color\(\s*srgb\s+([^\s]+)\s+([^\s]+)\s+([^\s/)]+)/i);
  if (srgb) {
    const channels = [Number(srgb[1]), Number(srgb[2]), Number(srgb[3])];
    if (channels.every(Number.isFinite)) {
      return /** @type {[number,number,number]} */ (channels.map((channel) => toByte(channel * 255)));
    }
  }

  return null;
}

/**
 * Conversion OKLCH → sRGB selon les matrices de référence OKLab, avec clamp dans le gamut sRGB.
 * @param {number} lightness
 * @param {number} chroma
 * @param {number} hueDeg
 * @returns {[number, number, number]}
 */
export function oklchToRgb(lightness, chroma, hueDeg) {
  const hue = hueDeg * Math.PI / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;

  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return /** @type {[number,number,number]} */ (linear.map((channel) => {
    const encoded = channel <= 0.0031308
      ? 12.92 * channel
      : 1.055 * channel ** (1 / 2.4) - 0.055;
    return toByte(encoded * 255);
  }));
}

/** @param {number} value */
function toByte(value) {
  return Math.round(Math.min(255, Math.max(0, value)));
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
