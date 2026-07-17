// @ts-check
import { resolveColor } from './color-utils.js';
import { frameDeltaSeconds } from './animation-time.js';
import { canvasPixelRatio } from './canvas-runtime.js';

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
  /** @type {number | null} */
  let previousTimestamp = null;
  /** @type {{x:number,y:number,len:number,vy:number,opacity:number}[]} */
  let drops = [];
  let rgb = resolveColor(color);

  function spawnX() {
    const { minX, maxX } = rainSpawnRange(cssW, cssH, angle);
    return minX + Math.random() * (maxX - minX);
  }

  function seedDrops() {
    const { minX, maxX } = rainSpawnRange(cssW, cssH, angle);
    // Garder une densité visuelle stable lorsque l'angle élargit le domaine nécessaire pour
    // couvrir le viewport. À 90°, le coût maximal reste borné à ~1,5× sur un canvas 1920×1080.
    const coverageFactor = cssW > 0 ? (maxX - minX) / (cssW + RAIN_MARGIN * 2) : 1;
    const count = Math.round((40 + intensity * 260) * coverageFactor);
    drops = Array.from({ length: count }, () => ({
      x: spawnX(),
      y: Math.random() * cssH,
      len: 12 + Math.random() * 18,
      // Vitesse en px/s (l'ancienne valeur 2-5 px/frame supposait implicitement 60 fps).
      vy: 120 + Math.random() * 180,
      opacity: 0.2 + Math.random() * 0.5,
    }));
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
    seedDrops();
    previousTimestamp = null;
    if (rafId !== 0) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function tick(timestamp) {
    rafId = requestAnimationFrame(tick);
    const delta = frameDeltaSeconds(previousTimestamp, timestamp);
    previousTimestamp = timestamp;
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
      d.x += dx * d.vy * speed * delta;
      d.y += d.vy * speed * delta;
      if (d.y > cssH) {
        d.y = -d.len;
        d.x = spawnX();
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
      if (typeof o.angle === 'number' && o.angle !== angle) { angle = o.angle; seedDrops(); }
      if (typeof o.color === 'string' && o.color !== color) { color = o.color; rgb = resolveColor(color); }
    },
    destroy() {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    },
  };
}

const RAIN_MARGIN = 100;

/**
 * Domaine horizontal nécessaire pour qu'une goutte reste susceptible de traverser le viewport
 * après sa dérive sur toute la hauteur. Pure : verrouille la couverture aux angles élevés.
 * @param {number} width
 * @param {number} height
 * @param {number} angleDeg
 * @returns {{ minX: number, maxX: number }}
 */
export function rainSpawnRange(width, height, angleDeg) {
  const drift = Math.sin((angleDeg * Math.PI) / 180) * height;
  return drift >= 0
    ? { minX: -RAIN_MARGIN - drift, maxX: width + RAIN_MARGIN }
    : { minX: -RAIN_MARGIN, maxX: width + RAIN_MARGIN - drift };
}

/** @param {number} v @param {number} min @param {number} max */
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
