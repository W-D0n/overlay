// @ts-check
import { resolveColor } from './color-utils.js';
import { easeProgress } from './DotGridAnimated.js';

/**
 * ShapeMorphBackground.js — Cycle de silhouettes qui morphent (Track B, session B8, idée
 * originale du chantier : pizza ↔ étoile ninja ↔ casque Shredder ↔ carapace tortue ninja ↔
 * masque Batman). Session la plus incertaine techniquement du Track B — séquencée en dernier,
 * même logique que `morph` en Track A.
 *
 * Technique retenue : interpolation RADIALE plutôt qu'un appariement de sommets SVG
 * (`<animate attributeName="points">`, vu chez robdimarzo). Chaque silhouette est un tableau de
 * `SAMPLES` rayons échantillonnés à angles fixes (0 → 2π) ; morphir d'une forme à l'autre =
 * interpoler ces rayons un par un. Ça marche pour n'importe quelle paire de silhouettes SANS
 * appariement manuel de sommets, au prix d'une fidélité stylisée (silhouettes minimalistes,
 * cohérentes avec la direction Atelier — pas des illustrations détaillées).
 *
 * **Honnêteté architecturale** : la reconnaissabilité de chaque silhouette est approximative par
 * construction (fonctions radiales simples, pas de tracé vectoriel fidèle). Le pari est que la
 * forme générale (triangle de pizza, étoile à pointes, dôme segmenté, oreilles pointues) suffit à
 * évoquer le sujet dans un style minimaliste, pas à le reproduire fidèlement.
 *
 * @param {{
 *   shape?: 'pizza' | 'ninjaStar' | 'helmet' | 'shell' | 'batmanMask',
 *   size?: number,          - rayon de base en px (défaut 140)
 *   color?: string,         - couleur de la silhouette, token CSS ou valeur brute (défaut var(--color-gold))
 *   x?: number,             - position horizontale, fraction 0-1 du canvas (défaut 0.5)
 *   y?: number,             - position verticale, fraction 0-1 du canvas (défaut 0.5)
 *   morphDuration?: number, - durée du morph entre deux formes, ms (défaut 700)
 *   morphEasing?: import('../types.js').TransitionEasing, - (défaut 'easeInOut')
 * }} [options]
 * @returns {import('../types.js').ComponentInstance}
 */
export function ShapeMorphBackground(options = {}) {
  let shapeName = options.shape ?? 'pizza';
  let size = options.size ?? 140;
  let color = options.color ?? 'var(--color-gold)';
  let posX = options.x ?? 0.5;
  let posY = options.y ?? 0.5;
  let morphDuration = options.morphDuration ?? 700;
  let morphEasing = options.morphEasing ?? 'easeInOut';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  let cssW = 0;
  let cssH = 0;
  let rafId = 0;
  let rgb = resolveColor(color);

  let currentRadii = computeRadii(shapeName);
  /** @type {{ from: Float32Array, to: Float32Array, startTime: number } | null} */
  let morphState = null;

  function handleResize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    if (w === 0 || h === 0) return;
    cssW = w;
    cssH = h;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    if (rafId !== 0) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function tick(timestamp) {
    rafId = requestAnimationFrame(tick);

    let radii = currentRadii;
    if (morphState !== null) {
      const raw = morphDuration > 0 ? (timestamp - morphState.startTime) / morphDuration : 1;
      const eased = easeProgress(morphEasing, raw);
      radii = lerpRadii(morphState.from, morphState.to, eased);
      if (raw >= 1) {
        currentRadii = morphState.to;
        morphState = null;
      }
    }

    ctx.clearRect(0, 0, cssW, cssH);
    const [r, g, b] = rgb;
    const cx = cssW * posX;
    const cy = cssH * posY;

    ctx.beginPath();
    for (let i = 0; i < SAMPLES; i++) {
      const theta = (i / SAMPLES) * Math.PI * 2;
      const radius = radii[i] * size;
      const x = cx + Math.cos(theta) * radius;
      const y = cy + Math.sin(theta) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(${r},${g},${b},0.9)`;
    ctx.fill();
  }

  const observer = new ResizeObserver(handleResize);
  observer.observe(canvas);

  return {
    el: canvas,
    /** @param {unknown} newOptions */
    update(newOptions) {
      const o = /** @type {Record<string, unknown>} */ (newOptions ?? {});
      if (typeof o.size === 'number') size = o.size;
      if (typeof o.x === 'number') posX = o.x;
      if (typeof o.y === 'number') posY = o.y;
      if (typeof o.morphDuration === 'number') morphDuration = o.morphDuration;
      if (typeof o.morphEasing === 'string') morphEasing = /** @type {*} */ (o.morphEasing);
      if (typeof o.color === 'string' && o.color !== color) { color = o.color; rgb = resolveColor(color); }

      if (isValidShape(o.shape) && o.shape !== shapeName) {
        const from = morphState ? lerpRadii(morphState.from, morphState.to, 0) : currentRadii;
        shapeName = o.shape;
        morphState = { from, to: computeRadii(shapeName), startTime: performance.now() };
      }
    },
    destroy() {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    },
  };
}

/** Échantillons radiaux par silhouette — résolution du polygone. */
export const SAMPLES = 48;

/** Noms de silhouettes valides — déclenchement manuel v1 (owner choisit via `shape`, pas de cycle auto). */
export const SHAPE_NAMES = /** @type {const} */ (['pizza', 'ninjaStar', 'helmet', 'shell', 'batmanMask']);

/**
 * @param {unknown} value
 * @returns {value is typeof SHAPE_NAMES[number]}
 */
function isValidShape(value) {
  return typeof value === 'string' && /** @type {readonly string[]} */ (SHAPE_NAMES).includes(value);
}

/** Différence angulaire signée dans [-π, π]. @param {number} a @param {number} b */
function angleDelta(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Pic triangulaire centré sur `center`, largeur angulaire `width`, amplitude [0,1]. */
function spike(theta, center, width) {
  return Math.max(0, 1 - Math.abs(angleDelta(theta, center)) / width);
}

/**
 * Points de contrôle `[angle, rayon]` du casque — polygone irrégulier (visière plus large en haut,
 * ouverture de nuque plus étroite en bas), triés par angle croissant sur [-π, π].
 * @type {[number, number][]}
 */
const HELMET_CONTROL_POINTS = [
  [-Math.PI, 0.85], [-Math.PI * 5 / 6, 1], [-Math.PI / 6, 1],
  [Math.PI / 6, 0.85], [Math.PI / 2, 0.55], [Math.PI * 5 / 6, 0.85], [Math.PI, 0.85],
];

/**
 * Interpole linéairement le rayon entre les deux points de contrôle encadrant `theta` — arêtes
 * droites entre les points (contour anguleux), pas de courbe lissée.
 * @param {number} theta - angle normalisé sur [-π, π]
 * @param {[number, number][]} points - triés par angle croissant, doit couvrir [-π, π]
 * @returns {number}
 */
function polygonRadius(theta, points) {
  const t = theta > Math.PI ? theta - Math.PI * 2 : theta;
  for (let i = 0; i < points.length - 1; i++) {
    const [a0, r0] = points[i];
    const [a1, r1] = points[i + 1];
    if (t >= a0 && t <= a1) {
      const progress = (t - a0) / (a1 - a0);
      return r0 + (r1 - r0) * progress;
    }
  }
  return points[points.length - 1][1];
}

/**
 * Calcule les `SAMPLES` rayons (normalisés [0,1]) d'une silhouette. Pure — testable indépendamment
 * du canvas (AD-1, même principe que les autres helpers purs du projet).
 * @param {string} shape
 * @returns {Float32Array}
 */
export function computeRadii(shape) {
  const radii = new Float32Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) {
    const theta = (i / SAMPLES) * Math.PI * 2;
    radii[i] = radiusAt(shape, theta);
  }
  return radii;
}

/**
 * @param {string} shape
 * @param {number} theta - angle en radians, [0, 2π)
 * @returns {number} rayon normalisé [0,1]
 */
function radiusAt(shape, theta) {
  switch (shape) {
    case 'pizza': {
      // Deux bords droits (rayons) + un arc de croûte : une part vue depuis sa pointe.
      const a = theta > Math.PI ? theta - Math.PI * 2 : theta;
      return Math.abs(a) < Math.PI / 5 ? 1 : 0.08;
    }
    case 'ninjaStar': {
      // Shuriken 4 branches à arêtes droites : fonction triangulaire par secteur de 90°
      // (creux au bord du secteur, pointe nette au centre) — plus fidèle qu'un lobe cosinus
      // arrondi (essayé d'abord, ressemblait à un trèfle, pas à des lames pointues).
      const sector = Math.PI / 2;
      const local = theta % sector;
      const d = Math.abs(local - sector / 2) / (sector / 2);
      return 0.22 + 0.78 * (1 - d);
    }
    case 'helmet':
      // Polygone irrégulier à arêtes droites (interpolation linéaire entre points de contrôle) —
      // un dôme en cosinus (essayé d'abord) donne un contour organique/arrondi, pas anguleux.
      return polygonRadius(theta, HELMET_CONTROL_POINTS);
    case 'shell':
      // Dôme segmenté à 6 facettes régulières — carapace.
      return 0.8 + 0.15 * Math.cos(6 * theta);
    case 'batmanMask': {
      // Cagoule arrondie + deux oreilles pointues en haut, léger creux au menton en bas.
      const up = -Math.PI / 2;
      const ear1 = spike(theta, up - 0.5, 0.45);
      const ear2 = spike(theta, up + 0.5, 0.45);
      const chin = Math.max(0, Math.cos(theta - Math.PI / 2)) * 0.12;
      return 0.55 + 0.45 * Math.max(ear1, ear2) - chin;
    }
    default:
      return 0.5;
  }
}

/**
 * Interpole deux tableaux de rayons rayon par rayon. Pure.
 * @param {Float32Array} from
 * @param {Float32Array} to
 * @param {number} progress - [0,1]
 * @returns {Float32Array}
 */
export function lerpRadii(from, to, progress) {
  const out = new Float32Array(from.length);
  for (let i = 0; i < from.length; i++) {
    out[i] = from[i] + (to[i] - from[i]) * progress;
  }
  return out;
}
