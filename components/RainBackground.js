// @ts-check
import { resolveColor } from './color-utils.js';

/**
 * RainBackground.js — Effet de fond « pluie » ambiante (Track B, session B3).
 *
 * Inspiration technique : CodePen vishwaoffl (CSS rain) — réinterprété en canvas/rAF (même pattern
 * que `DotGridAnimated.js`) et sans interaction souris : une Browser Source OBS n'a pas de curseur
 * (`pointer-events: none` partout), l'effet est donc strictement ambiant (voir
 * docs/specs/background-effects-library.md §Exclu).
 *
 * @param {{
 *   intensity?: number, - densité des gouttes, 0-1 (défaut 0.5)
 *   speed?: number,     - vitesse de chute, multiplicateur (défaut 1)
 *   color?: string,     - couleur des gouttes, token CSS ou valeur brute (défaut var(--color-gold))
 *   angle?: number,     - inclinaison du vent en degrés (défaut 8)
 * }} [options]
 * @returns {import('../types.js').ComponentInstance}
 */
export function RainBackground(options = {}) {
  let intensity = clamp(options.intensity ?? 0.5, 0, 1);
  let speed = options.speed ?? 1;
  let color = options.color ?? 'var(--color-gold)';
  let angle = options.angle ?? 8;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  let cssW = 0;
  let cssH = 0;
  let rafId = 0;
  /** @type {{x:number,y:number,len:number,vy:number,opacity:number}[]} */
  let drops = [];
  let rgb = resolveColor(color);

  function seedDrops() {
    const count = Math.round(40 + intensity * 260);
    drops = Array.from({ length: count }, () => ({
      x: Math.random() * (cssW + 200) - 100,
      y: Math.random() * cssH,
      len: 12 + Math.random() * 18,
      vy: (2 + Math.random() * 3) * speed,
      opacity: 0.2 + Math.random() * 0.5,
    }));
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
    seedDrops();
    if (rafId !== 0) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function tick() {
    rafId = requestAnimationFrame(tick);
    ctx.clearRect(0, 0, cssW, cssH);
    const dx = Math.sin((angle * Math.PI) / 180);
    const [r, g, b] = rgb;
    for (const d of drops) {
      ctx.strokeStyle = `rgba(${r},${g},${b},${d.opacity.toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + dx * d.len, d.y + d.len);
      ctx.stroke();
      d.x += dx * d.vy;
      d.y += d.vy;
      if (d.y > cssH) {
        d.y = -d.len;
        d.x = Math.random() * (cssW + 200) - 100;
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
      if (typeof o.intensity === 'number') { intensity = clamp(o.intensity, 0, 1); seedDrops(); }
      if (typeof o.speed === 'number') speed = o.speed;
      if (typeof o.angle === 'number') angle = o.angle;
      if (typeof o.color === 'string' && o.color !== color) { color = o.color; rgb = resolveColor(color); }
    },
    destroy() {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    },
  };
}

/** @param {number} v @param {number} min @param {number} max */
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
