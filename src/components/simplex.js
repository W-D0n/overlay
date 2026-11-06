// @ts-check
/**
 * simplex.js — Simplex noise 2D déterministe.
 * Port de Stefan Gustavson (domaine public, 2012).
 * Référence : simplexnoise.pdf (weber.itn.liu.se/~stegu)
 *
 * Signature exportée : simplex2(x, y) → [-1, 1]
 * Zéro dépendance — pur ES module.
 */

// Table de permutation de Gustavson (256 valeurs fixes, doublée pour éviter le modulo)
const SOURCE = /** @type {readonly number[]} */ ([
  151,160,137, 91, 90, 15,131, 13,201, 95, 96, 53,194,233,  7,225,
  140, 36,103, 30, 69,142,  8, 99, 37,240, 21, 10, 23,190,  6,148,
  247,120,234, 75,  0, 26,197, 62, 94,252,219,203,117, 35, 11, 32,
   57,177, 33, 88,237,149, 56, 87,174, 20,125,136,171,168, 68,175,
   74,165, 71,134,139, 48, 27,166, 77,146,158,231, 83,111,229,122,
   60,211,133,230,220,105, 92, 41, 55, 46,245, 40,244,102,143, 54,
   65, 25, 63,161,  1,216, 80, 73,209, 76,132,187,208, 89, 18,169,
  200,196,135,130,116,188,159, 86,164,100,109,198,173,186,  3, 64,
   52,217,226,250,124,123,  5,202, 38,147,118,126,255, 82, 85,212,
  207,206, 59,227, 47, 16, 58, 17,182,189, 28, 42,223,183,170,213,
  119,248,152,  2, 44,154,163, 70,221,153,101,155,167, 43,172,  9,
  129, 22, 39,253, 19, 98,108,110, 79,113,224,232,178,185,112,104,
  218,246, 97,228,251, 34,242,193,238,210,144, 12,191,179,162,241,
   81, 51,145,235,249, 14,239,107, 49,192,214, 31,181,199,106,157,
  184, 84,204,176,115,121, 50, 45,127,  4,150,254,138,236,205, 93,
  222,114, 67, 29, 24, 72,243,141,128,195, 78, 66,215, 61,156,180,
]);

const PERM = new Uint8Array(512);
for (let i = 0; i < 256; i++) PERM[i] = PERM[i + 256] = SOURCE[i];

// 8 gradients 2D (directions équidistantes)
const GRAD2 = /** @type {readonly [number, number][]} */ ([
  [ 1,  1], [-1,  1], [ 1, -1], [-1, -1],
  [ 1,  0], [-1,  0], [ 0,  1], [ 0, -1],
]);

// Facteurs de skewing pour la grille simplexe 2D
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

/**
 * Noise Simplex 2D.
 * @param {number} x
 * @param {number} y
 * @returns {number} Valeur dans [-1, 1]
 */
export function simplex2(x, y) {
  // Transformation vers la grille triangulaire
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;

  // Distances depuis l'origine du simplex
  const x0 = x - (i - t);
  const y0 = y - (j - t);

  // Quel triangle du simplex ?
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;

  // Indices gradient des trois coins
  const ii  = i & 255;
  const jj  = j & 255;
  const gi0 = PERM[ii +      PERM[jj     ]] % 8;
  const gi1 = PERM[ii + i1 + PERM[jj + j1]] % 8;
  const gi2 = PERM[ii + 1  + PERM[jj + 1 ]] % 8;

  // Contributions des trois coins
  let n = 0;

  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) {
    t0 *= t0;
    n  += t0 * t0 * (GRAD2[gi0][0] * x0 + GRAD2[gi0][1] * y0);
  }

  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) {
    t1 *= t1;
    n  += t1 * t1 * (GRAD2[gi1][0] * x1 + GRAD2[gi1][1] * y1);
  }

  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) {
    t2 *= t2;
    n  += t2 * t2 * (GRAD2[gi2][0] * x2 + GRAD2[gi2][1] * y2);
  }

  // Facteur 70 : normalisation empirique de Gustavson → [-1, 1]
  return 70 * n;
}
