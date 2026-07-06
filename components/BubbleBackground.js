// @ts-check
import { resolveColor } from './color-utils.js';

/**
 * BubbleBackground.js — Bulles ambiantes montantes, avec éclatement (Track B, session B4).
 *
 * Inspiration technique : CodePen diyorbek0309 (bulles montantes) — portée en canvas/rAF (même
 * pattern que `DotGridAnimated.js`) avec l'ajout explicite demandé par l'owner : chaque bulle
 * éclate (anneau qui s'étend puis s'estompe) au lieu de simplement disparaître en haut de l'écran.
 *
 * @param {{
 *   count?: number,     - nombre de bulles simultanées (défaut 15)
 *   speed?: number,     - vitesse de montée, multiplicateur (défaut 1)
 *   color?: string,     - couleur des bulles, token CSS ou valeur brute (défaut var(--color-gold))
 *   minRadius?: number, - rayon minimum en px (défaut 6)
 *   maxRadius?: number, - rayon maximum en px (défaut 22)
 * }} [options]
 * @returns {import('../types.js').ComponentInstance}
 */
export function BubbleBackground(options = {}) {
  let count = Math.max(1, Math.round(options.count ?? 15));
  let speed = options.speed ?? 1;
  let color = options.color ?? 'var(--color-gold)';
  let minRadius = options.minRadius ?? 6;
  let maxRadius = options.maxRadius ?? 22;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  let cssW = 0;
  let cssH = 0;
  let rafId = 0;
  let rgb = resolveColor(color);

  const BURST_FRAMES = 22;

  /** @typedef {{x:number,y:number,r:number,vy:number,drift:number,phase:'rising'|'bursting',burstT:number}} Bubble */
  /** @type {Bubble[]} */
  let bubbles = [];

  /** @returns {Bubble} */
  function spawn(fromBottom = true) {
    const r = minRadius + Math.random() * (maxRadius - minRadius);
    return {
      x: Math.random() * cssW,
      y: fromBottom ? cssH + r : Math.random() * cssH,
      r,
      vy: (0.4 + Math.random() * 0.8) * speed,
      drift: (Math.random() - 0.5) * 0.6,
      phase: 'rising',
      burstT: 0,
    };
  }

  function seed() {
    bubbles = Array.from({ length: count }, () => spawn(false));
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

  function tick(timestamp) {
    rafId = requestAnimationFrame(tick);
    ctx.clearRect(0, 0, cssW, cssH);
    const [r, g, b] = rgb;

    for (let i = 0; i < bubbles.length; i++) {
      const bub = bubbles[i];

      if (bub.phase === 'rising') {
        bub.y -= bub.vy;
        bub.x += Math.sin(timestamp * 0.001 + bub.y * 0.02) * bub.drift;

        ctx.strokeStyle = `rgba(${r},${g},${b},0.55)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bub.x, bub.y, bub.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(${r},${g},${b},0.12)`;
        ctx.fill();

        // Éclatement quand la bulle atteint le haut — jamais une disparition instantanée.
        if (bub.y + bub.r < 0) bub.phase = 'bursting';
      } else {
        bub.burstT += 1;
        const t = bub.burstT / BURST_FRAMES;
        const ringRadius = bub.r * (1 + t * 1.8);
        const opacity = Math.max(0, 0.6 * (1 - t));
        ctx.strokeStyle = `rgba(${r},${g},${b},${opacity.toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bub.x, Math.max(bub.r, bub.y), ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        if (bub.burstT >= BURST_FRAMES) bubbles[i] = spawn(true);
      }
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
      if (typeof o.minRadius === 'number') minRadius = o.minRadius;
      if (typeof o.maxRadius === 'number') maxRadius = o.maxRadius;
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

