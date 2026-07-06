// @ts-check
import { resolveColor } from './color-utils.js';

/**
 * OrbitingShapesBackground.js — Formes en orbite pseudo-3D (Track B, session B7).
 *
 * Consolide 3 CodePen en un seul composant paramétré par `shape` (nefejames floating-balls,
 * robdimarzo triangle-fusion, natewiley tri-travelers) : chaque forme orbite autour d'un centre
 * propre sur une ellipse aplatie, avec échelle/opacité liées à la phase de l'orbite pour simuler
 * une profondeur (avant = grand/opaque, arrière = petit/discret) — même principe que
 * `natewiley` (translate3d + scale), porté en canvas 2D (pas de vrai 3D nécessaire ici).
 *
 * @param {{
 *   shape?: 'circle' | 'triangle',
 *   count?: number,     - nombre de formes simultanées (défaut 10)
 *   speed?: number,     - vitesse de rotation orbitale, multiplicateur (défaut 1)
 *   color?: string,     - couleur des formes, token CSS ou valeur brute (défaut var(--color-gold))
 *   minSize?: number,   - taille minimum en px, à profondeur maximale (défaut 8)
 *   maxSize?: number,   - taille maximum en px, au plus proche (défaut 28)
 * }} [options]
 * @returns {import('../types.js').ComponentInstance}
 */
export function OrbitingShapesBackground(options = {}) {
  let shape = options.shape ?? 'circle';
  let count = Math.max(1, Math.round(options.count ?? 10));
  let speed = options.speed ?? 1;
  let color = options.color ?? 'var(--color-gold)';
  let minSize = options.minSize ?? 8;
  let maxSize = options.maxSize ?? 28;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  let cssW = 0;
  let cssH = 0;
  let rafId = 0;
  let rgb = resolveColor(color);

  /** @typedef {{cx:number,cy:number,radiusX:number,radiusY:number,phase:number,angularSpeed:number,baseSize:number}} Orbiter */
  /** @type {Orbiter[]} */
  let orbiters = [];

  /** @returns {Orbiter} */
  function spawn() {
    return {
      cx: Math.random() * cssW,
      cy: Math.random() * cssH,
      radiusX: 40 + Math.random() * 160,
      radiusY: 20 + Math.random() * 80,
      phase: Math.random() * Math.PI * 2,
      angularSpeed: 0.3 + Math.random() * 0.5,
      baseSize: minSize + Math.random() * (maxSize - minSize),
    };
  }

  function seed() {
    orbiters = Array.from({ length: count }, spawn);
  }

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
    seed();
    if (rafId !== 0) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  /** @param {number} cx @param {number} cy @param {number} size @param {number} rotation */
  function drawShape(cx, cy, size, rotation) {
    if (shape === 'triangle') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.87, size * 0.5);
      ctx.lineTo(-size * 0.87, size * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function tick(timestamp) {
    rafId = requestAnimationFrame(tick);
    ctx.clearRect(0, 0, cssW, cssH);
    const t = timestamp * 0.001 * speed;
    const [r, g, b] = rgb;

    for (const o of orbiters) {
      const angle = t * o.angularSpeed + o.phase;
      const depth = (Math.sin(angle) + 1) / 2; // 0 = fond, 1 = premier plan
      const x = o.cx + Math.cos(angle) * o.radiusX;
      const y = o.cy + Math.sin(angle) * o.radiusY;
      const size = o.baseSize * (0.4 + 0.6 * depth);
      const opacity = 0.15 + 0.55 * depth;

      ctx.fillStyle = `rgba(${r},${g},${b},${opacity.toFixed(3)})`;
      drawShape(x, y, size, angle);
    }
  }

  const observer = new ResizeObserver(handleResize);
  observer.observe(canvas);

  return {
    el: canvas,
    /** @param {unknown} newOptions */
    update(newOptions) {
      const o = /** @type {Record<string, unknown>} */ (newOptions ?? {});
      if (o.shape === 'circle' || o.shape === 'triangle') shape = o.shape;
      if (typeof o.speed === 'number') speed = o.speed;
      if (typeof o.minSize === 'number') minSize = o.minSize;
      if (typeof o.maxSize === 'number') maxSize = o.maxSize;
      if (typeof o.color === 'string' && o.color !== color) { color = o.color; rgb = resolveColor(color); }
      if (typeof o.count === 'number' && Math.round(o.count) !== count) {
        count = Math.max(1, Math.round(o.count));
        seed();
      }
    },
    destroy() {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    },
  };
}
