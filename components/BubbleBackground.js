// @ts-check
import { resolveColor } from './color-utils.js';
import { frameDeltaSeconds } from './animation-time.js';
import { canvasPixelRatio } from './canvas-runtime.js';

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
 *   burstMinTravel?: number, - trajet minimum avant éclatement, ratio 0-1 (défaut 0.15)
 *   burstMaxTravel?: number, - trajet maximum avant éclatement, ratio 0-1 (défaut 0.9)
 *   burstDuration?: number, - durée de l'anneau d'éclatement en secondes (défaut 0.37)
 *   burstScale?: number, - expansion finale de l'anneau (défaut 1.8)
 * }} [options]
 * @returns {import('../types.js').ComponentInstance}
 */
export function BubbleBackground(options = {}) {
  let count = Math.max(1, Math.round(options.count ?? 15));
  let speed = options.speed ?? 1;
  let color = options.color ?? 'var(--color-gold)';
  let minRadius = options.minRadius ?? 6;
  let maxRadius = options.maxRadius ?? 22;
  let burstMinTravel = options.burstMinTravel ?? 0.15;
  let burstMaxTravel = options.burstMaxTravel ?? 0.9;
  let burstDuration = Math.max(0.05, options.burstDuration ?? 0.37);
  let burstScale = Math.max(0, options.burstScale ?? 1.8);

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  let cssW = 0;
  let cssH = 0;
  let rafId = 0;
  /** @type {number | null} */
  let previousTimestamp = null;
  let rgb = resolveColor(color);

  /** @typedef {{x:number,y:number,r:number,vy:number,driftSpeed:number,phase:'rising'|'bursting',burstT:number,burstY:number}} Bubble */
  /** @type {Bubble[]} */
  let bubbles = [];

  /** @returns {Bubble} */
  function spawn(fromBottom = true) {
    const r = minRadius + Math.random() * (maxRadius - minRadius);
    const y = fromBottom ? cssH + r : Math.random() * cssH;
    return {
      x: Math.random() * cssW,
      y,
      r,
      vy: (0.4 + Math.random() * 0.8) * 60,
      driftSpeed: (Math.random() - 0.5) * 0.6 * 60,
      phase: 'rising',
      burstT: 0,
      burstY: bubbleBurstY(y, sampleBurstTravel(burstMinTravel, burstMaxTravel)),
    };
  }

  function seed() {
    bubbles = Array.from({ length: count }, () => spawn(false));
  }

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
    const [r, g, b] = rgb;

    for (let i = 0; i < bubbles.length; i++) {
      const bub = bubbles[i];

      if (bub.phase === 'rising') {
        bub.y -= bub.vy * speed * delta;
        bub.x += Math.sin(timestamp * 0.001 * speed + bub.y * 0.02) * bub.driftSpeed * speed * delta;

        ctx.strokeStyle = `rgba(${r},${g},${b},0.55)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bub.x, bub.y, bub.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(${r},${g},${b},0.12)`;
        ctx.fill();

        // Chaque bulle possède son propre seuil de trajet : l'éclatement est distribué sur toute
        // la hauteur, le bord haut ne servant plus que de filet de sécurité.
        if (shouldBurstBubble(bub.y, bub.r, bub.burstY)) bub.phase = 'bursting';
      } else {
        bub.burstT += delta * speed;
        const t = bub.burstT / burstDuration;
        const ringRadius = bub.r * (1 + t * burstScale);
        const opacity = Math.max(0, 0.6 * (1 - t));
        ctx.strokeStyle = `rgba(${r},${g},${b},${opacity.toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bub.x, Math.max(bub.r, bub.y), ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        if (bub.burstT >= burstDuration) bubbles[i] = spawn(true);
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
      if (typeof o.burstMinTravel === 'number') burstMinTravel = o.burstMinTravel;
      if (typeof o.burstMaxTravel === 'number') burstMaxTravel = o.burstMaxTravel;
      if (typeof o.burstDuration === 'number') burstDuration = Math.max(0.05, o.burstDuration);
      if (typeof o.burstScale === 'number') burstScale = Math.max(0, o.burstScale);
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

/**
 * Tire une distance de trajet normalisée, indépendante du framerate.
 * @param {number} min
 * @param {number} max
 * @param {() => number} [random]
 */
export function sampleBurstTravel(min, max, random = Math.random) {
  const low = Math.max(0, Math.min(1, Math.min(min, max)));
  const high = Math.max(0, Math.min(1, Math.max(min, max)));
  return low + (high - low) * Math.max(0, Math.min(1, random()));
}

/** @param {number} startY @param {number} travelRatio */
export function bubbleBurstY(startY, travelRatio) {
  return startY * (1 - Math.max(0, Math.min(1, travelRatio)));
}

/** @param {number} y @param {number} radius @param {number} burstY */
export function shouldBurstBubble(y, radius, burstY) {
  return y <= burstY || y + radius < 0;
}
