// @ts-check
import { canvasPixelRatio } from './canvas-runtime.js';
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
import { frameDeltaSeconds } from './animation-time.js';

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
  /** @type {number | null} */
  let previousTimestamp = null;
  /** @type {[number, number, number][]} */
  let rgbPalette = colors.map(resolveColor);
  /** @type {CanvasGradient[]} */
  let gradients = [];

  /**
   * Un gradient par couleur de palette, en coordonnées LOCALES `(0,-length)` → `(0,0)` — traduit
   * via `ctx.translate(d.x, d.y)` au dessin (voir `tick`) plutôt que recréé avec les coordonnées
   * absolues de chaque goutte. `createLinearGradient`/`addColorStop` recréaient un objet canvas par
   * goutte à CHAQUE frame (jusqu'à `count`×60/s) — coût CPU superflu en contexte stream (OBS +
   * encodage + jeu se partagent déjà la machine), alors que seules `colors`/`length` en changent le
   * résultat. À reconstruire uniquement quand l'un des deux change (voir `update`).
   */
  function buildGradients() {
    gradients = rgbPalette.map(([r, g, b]) => {
      const grad = ctx.createLinearGradient(0, -length, 0, 0);
      grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0.35)`);
      return grad;
    });
  }

  /** @typedef {{x:number,y:number,vy:number,colorIdx:number,width:number}} Drop */
  /** @type {Drop[]} */
  let drops = [];

  /** @returns {Drop} */
  function spawn(randomY = true) {
    return {
      x: Math.random() * cssW,
      y: randomY ? Math.random() * cssH : -length,
      vy: (1.5 + Math.random() * 2.5) * 60,
      colorIdx: Math.floor(Math.random() * rgbPalette.length),
      width: 0.5 + Math.random() * 1.2,
    };
  }

  function seed() {
    drops = Array.from({ length: count }, () => spawn(true));
  }

  buildGradients();

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
    seed();
    previousTimestamp = null;
    if (rafId !== 0) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function tick(timestamp) {
    rafId = requestAnimationFrame(tick);
    const delta = frameDeltaSeconds(previousTimestamp, timestamp);
    previousTimestamp = timestamp;
    ctx.clearRect(0, 0, cssW, cssH);

    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      ctx.save();
      ctx.translate(d.x, d.y);
      const [r, g, b] = rgbPalette[d.colorIdx] ?? [200, 185, 122];
      ctx.strokeStyle = gradients[d.colorIdx] ?? `rgba(${r},${g},${b},0.35)`;
      ctx.lineWidth = d.width;
      ctx.beginPath();
      ctx.moveTo(0, -length);
      ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.restore();

      d.y += d.vy * speed * delta;
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
      let gradientsStale = false;
      if (typeof o.length === 'number' && o.length !== length) { length = o.length; gradientsStale = true; }
      if (Array.isArray(o.colors)) { colors = /** @type {string[]} */ (o.colors); rgbPalette = colors.map(resolveColor); gradientsStale = true; }
      if (gradientsStale) buildGradients();
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
