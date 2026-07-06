// @ts-check
import { resolveColor } from './color-utils.js';

/**
 * FirefliesBackground.js — Particules lumineuses dérivantes, avec flash (Track B, session B4).
 *
 * Inspiration technique : CodePen mikegolus (CSS Fireflies) — portée en canvas/rAF (même pattern
 * que `DotGridAnimated.js`) : chaque luciole dérive selon une trajectoire lissajous individuelle
 * (fréquences/phases propres, comme la Couche 1 de DotGrid) et émet des flashs lumineux
 * intermittents plutôt qu'une opacité constante.
 *
 * @param {{
 *   count?: number,       - nombre de lucioles (défaut 25)
 *   speed?: number,       - vitesse de dérive, multiplicateur (défaut 1)
 *   color?: string,       - couleur des lucioles, token CSS ou valeur brute (défaut var(--color-gold))
 *   flashChance?: number, - probabilité de déclencher un flash par frame et par luciole (défaut 0.006)
 * }} [options]
 * @returns {import('../types.js').ComponentInstance}
 */
export function FirefliesBackground(options = {}) {
  let count = Math.max(1, Math.round(options.count ?? 25));
  let speed = options.speed ?? 1;
  let color = options.color ?? 'var(--color-gold)';
  let flashChance = options.flashChance ?? 0.006;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  let cssW = 0;
  let cssH = 0;
  let rafId = 0;
  let rgb = resolveColor(color);

  const FLASH_FRAMES = 40;

  /** @typedef {{cx:number,cy:number,radiusX:number,radiusY:number,freqX:number,freqY:number,phase:number,baseOpacity:number,flashT:number}} Firefly */
  /** @type {Firefly[]} */
  let flies = [];

  /** @returns {Firefly} */
  function spawn() {
    return {
      cx: Math.random() * cssW,
      cy: Math.random() * cssH,
      radiusX: 40 + Math.random() * 120,
      radiusY: 30 + Math.random() * 100,
      freqX: 0.1 + Math.random() * 0.2,
      freqY: 0.08 + Math.random() * 0.18,
      phase: Math.random() * Math.PI * 2,
      baseOpacity: 0.15 + Math.random() * 0.2,
      flashT: 0,
    };
  }

  function seed() {
    flies = Array.from({ length: count }, spawn);
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
    const t = timestamp * 0.001 * speed;
    const [r, g, b] = rgb;

    for (const fly of flies) {
      const x = fly.cx + Math.sin(t * fly.freqX + fly.phase) * fly.radiusX;
      const y = fly.cy + Math.cos(t * fly.freqY + fly.phase) * fly.radiusY;

      if (fly.flashT === 0 && Math.random() < flashChance) fly.flashT = FLASH_FRAMES;

      let opacity = fly.baseOpacity;
      let glowRadius = 2;
      if (fly.flashT > 0) {
        const progress = fly.flashT / FLASH_FRAMES;
        opacity = fly.baseOpacity + 0.85 * Math.sin(progress * Math.PI); // monte puis redescend
        glowRadius = 2 + 6 * Math.sin(progress * Math.PI);
        fly.flashT -= 1;
      }

      ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, opacity).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
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
      if (typeof o.flashChance === 'number') flashChance = o.flashChance;
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

