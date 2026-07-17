// @ts-check
import { resolveColor } from './color-utils.js';
import { easeProgress } from './DotGridAnimated.js';
import { canvasPixelRatio } from './canvas-runtime.js';

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
 *   count?: number,         - nombre de formes dans le pattern (défaut 12)
 *   spread?: number,        - étendue du pattern, fraction 0-1 (défaut 0.82)
 *   size?: number,          - rayon de base en px (défaut 72)
 *   color?: string,         - couleur de la silhouette, token CSS ou valeur brute (défaut var(--color-gold))
 *   opacity?: number,       - opacité globale, 0-1 (défaut 0.45)
 *   style?: 'outline' | 'fill' | 'mixed', - traitement visuel (défaut 'mixed')
 *   rotationSpeed?: number, - vitesse de rotation alternée (défaut 0.08)
 *   x?: number,             - centre horizontal du pattern, fraction 0-1 (défaut 0.5)
 *   y?: number,             - centre vertical du pattern, fraction 0-1 (défaut 0.5)
 *   morphDuration?: number, - durée du morph entre deux formes, ms (défaut 700)
 *   morphEasing?: import('../types.js').TransitionEasing, - (défaut 'easeInOut')
 * }} [options]
 * @returns {import('../types.js').ComponentInstance}
 */
export function ShapeMorphBackground(options = {}) {
  let shapeName = options.shape ?? 'pizza';
  let count = Math.max(1, Math.round(options.count ?? 12));
  let spread = clamp(options.spread ?? 0.82, 0, 1);
  let size = options.size ?? 72;
  let color = options.color ?? 'var(--color-gold)';
  let opacity = clamp(options.opacity ?? 0.45, 0, 1);
  let style = isDrawStyle(options.style) ? options.style : 'mixed';
  let rotationSpeed = options.rotationSpeed ?? 0.08;
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
  let layout = buildPatternLayout(count, spread);
  /** @type {{ from: Float32Array, to: Float32Array, startTime: number } | null} */
  let morphState = null;

  function handleResize() {
    const dpr = canvasPixelRatio();
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

    for (const item of layout) {
      const cx = cssW * (posX + item.x);
      const cy = cssH * (posY + item.y);
      const rotation = item.rotation + timestamp * 0.001 * rotationSpeed * item.direction;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.beginPath();
      for (let i = 0; i < SAMPLES; i++) {
        const theta = (i / SAMPLES) * Math.PI * 2;
        const radius = radii[i] * size * item.scale;
        const x = Math.cos(theta) * radius;
        const y = Math.sin(theta) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      if (style === 'fill' || style === 'mixed') {
        const fillAlpha = style === 'fill' ? opacity : opacity * 0.22;
        ctx.fillStyle = `rgba(${r},${g},${b},${fillAlpha.toFixed(3)})`;
        ctx.fill();
      }
      if (style === 'outline' || style === 'mixed') {
        ctx.strokeStyle = `rgba(${r},${g},${b},${opacity.toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  const observer = new ResizeObserver(handleResize);
  observer.observe(canvas);

  return {
    el: canvas,
    /** @param {unknown} newOptions */
    update(newOptions) {
      const o = /** @type {Record<string, unknown>} */ (newOptions ?? {});
      let layoutStale = false;
      if (typeof o.count === 'number' && Math.round(o.count) !== count) {
        count = Math.max(1, Math.round(o.count));
        layoutStale = true;
      }
      if (typeof o.spread === 'number' && o.spread !== spread) {
        spread = clamp(o.spread, 0, 1);
        layoutStale = true;
      }
      if (typeof o.size === 'number') size = o.size;
      if (typeof o.opacity === 'number') opacity = clamp(o.opacity, 0, 1);
      if (isDrawStyle(o.style)) style = o.style;
      if (typeof o.rotationSpeed === 'number') rotationSpeed = o.rotationSpeed;
      if (typeof o.x === 'number') posX = o.x;
      if (typeof o.y === 'number') posY = o.y;
      if (typeof o.morphDuration === 'number') morphDuration = o.morphDuration;
      if (typeof o.morphEasing === 'string') morphEasing = /** @type {*} */ (o.morphEasing);
      if (typeof o.color === 'string' && o.color !== color) { color = o.color; rgb = resolveColor(color); }
      if (layoutStale) layout = buildPatternLayout(count, spread);

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
const DRAW_STYLES = /** @type {const} */ (['outline', 'fill', 'mixed']);

/**
 * @param {unknown} value
 * @returns {value is typeof SHAPE_NAMES[number]}
 */
function isValidShape(value) {
  return typeof value === 'string' && /** @type {readonly string[]} */ (SHAPE_NAMES).includes(value);
}

/** @param {unknown} value @returns {value is typeof DRAW_STYLES[number]} */
function isDrawStyle(value) {
  return typeof value === 'string' && /** @type {readonly string[]} */ (DRAW_STYLES).includes(value);
}

/**
 * Distribution en grille centrée, stable et indépendante de la taille du canvas. La dernière ligne
 * incomplète est recentrée au lieu de rester collée à gauche.
 * @param {number} requestedCount
 * @param {number} requestedSpread
 * @returns {{x:number,y:number,scale:number,rotation:number,direction:1|-1}[]}
 */
export function buildPatternLayout(requestedCount, requestedSpread) {
  const safeCount = Math.max(1, Math.round(requestedCount));
  const safeSpread = clamp(requestedSpread, 0, 1);
  const columns = Math.max(1, Math.ceil(Math.sqrt(safeCount * 16 / 9)));
  const rows = Math.ceil(safeCount / columns);
  const layout = [];

  for (let index = 0; index < safeCount; index++) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const itemsInRow = Math.min(columns, safeCount - row * columns);
    const centeredColumn = column + (columns - itemsInRow) / 2;
    const x = columns === 1 ? 0 : (centeredColumn / (columns - 1) - 0.5) * safeSpread;
    const y = rows === 1 ? 0 : (row / (rows - 1) - 0.5) * safeSpread;
    layout.push({
      x,
      y,
      scale: 0.76 + ((index * 37) % 9) * 0.045,
      rotation: (index * 2.399963) % (Math.PI * 2),
      direction: /** @type {1|-1} */ (index % 2 === 0 ? 1 : -1),
    });
  }
  return layout;
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

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
