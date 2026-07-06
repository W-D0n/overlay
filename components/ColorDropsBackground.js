// @ts-check
/**
 * ColorDropsBackground.js — Gouttes de couleur tombant verticalement (Track B, session B6).
 *
 * Inspiration technique : CodePen nefejames (color-drip) + natewiley (color-drops) — portée en
 * canvas/rAF (même pattern que `DotGridAnimated.js`/`RainBackground.js`). Différence avec
 * `RainBackground` : ici l'accent est la variété de couleurs par goutte (dégradé vers le bas,
 * palette multi-teintes), chute strictement verticale, pas d'inclinaison de vent.
 *
 * @param {{
 *   count?: number,   - nombre de gouttes simultanées (défaut 24)
 *   speed?: number,   - vitesse de chute, multiplicateur (défaut 1)
 *   colors?: string[], - palette de couleurs, tokens CSS ou valeurs brutes (défaut palette Atelier)
 *   length?: number,  - longueur de la traînée en px (défaut 90)
 * }} [options]
 * @returns {import('../types.js').ComponentInstance}
 */
import { resolveColor } from './color-utils.js';

export function ColorDropsBackground(options = {}) {
  let count = Math.max(1, Math.round(options.count ?? 24));
  let speed = options.speed ?? 1;
  let colors = options.colors ?? ['var(--color-gold)', '#8A2BE2', '#1E90FF', '#DC143C'];
  let length = options.length ?? 90;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  let cssW = 0;
  let cssH = 0;
  let rafId = 0;
  /** @type {[number, number, number][]} */
  let rgbPalette = colors.map(resolveColor);

  /** @typedef {{x:number,y:number,vy:number,colorIdx:number,width:number}} Drop */
  /** @type {Drop[]} */
  let drops = [];

  /** @returns {Drop} */
  function spawn(randomY = true) {
    return {
      x: Math.random() * cssW,
      y: randomY ? Math.random() * cssH : -length,
      vy: (1.5 + Math.random() * 2.5) * speed,
      colorIdx: Math.floor(Math.random() * rgbPalette.length),
      width: 0.5 + Math.random() * 1.2,
    };
  }

  function seed() {
    drops = Array.from({ length: count }, () => spawn(true));
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

  function tick() {
    rafId = requestAnimationFrame(tick);
    ctx.clearRect(0, 0, cssW, cssH);

    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      const [r, g, b] = rgbPalette[d.colorIdx] ?? [200, 185, 122];
      const grad = ctx.createLinearGradient(d.x, d.y - length, d.x, d.y);
      grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0.35)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = d.width;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y - length);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();

      d.y += d.vy;
      if (d.y - length > cssH) drops[i] = spawn(false);
    }
  }

  const observer = new ResizeObserver(handleResize);
  observer.observe(canvas);

  return {
    el: canvas,
    /** @param {unknown} newOptions */
    update(newOptions) {
      const o = /** @type {Record<string, unknown>} */ (newOptions ?? {});
      if (typeof o.speed === 'number') speed = o.speed;
      if (typeof o.length === 'number') length = o.length;
      if (Array.isArray(o.colors)) { colors = /** @type {string[]} */ (o.colors); rgbPalette = colors.map(resolveColor); }
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
