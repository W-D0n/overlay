// @ts-check
import { resolveColor } from './color-utils.js';
import { canvasPixelRatio } from './canvas-runtime.js';

/**
 * ReactionOverlay.js — Couche de réaction partagée pour le mode fond autonome (2026-07-24).
 *
 * Canvas transparent plein cadre dessinant une réaction en or Atelier par-dessus n'importe quel
 * effet de fond. Utilisée quand l'effet monté n'expose pas `trigger()` (routage dans
 * background-reactions.js). RAF paresseux : démarre au trigger, s'arrête dès qu'aucune réaction
 * n'est active. Voir docs/specs/background-reactive-events.md.
 */

/** @type {Record<string, number>} */
export const REACTION_DURATIONS = { follow: 1800, sub: 1600, raid: 2600, bits: 1400 };

/** @param {string} type @returns {number | null} */
export function reactionDuration(type) {
  return Object.prototype.hasOwnProperty.call(REACTION_DURATIONS, type) ? REACTION_DURATIONS[type] : null;
}

/** @param {number} progress @param {number} diagonal */
export function followRadius(progress, diagonal) { return progress * diagonal; }

/** @param {number} progress @param {number} [max] */
export function pulseAlpha(progress, max = 0.28) { return Math.sin(progress * Math.PI) * max; }

/** @param {number} progress @param {number} cssW @param {number} bandWidth */
export function raidBandCenter(progress, cssW, bandWidth) { return -bandWidth + progress * (cssW + 2 * bandWidth); }

/** @param {() => number} [random] @returns {number} 18 à 32 */
export function bitsCount(random = Math.random) { return 18 + Math.floor(random() * 15); }

/**
 * Style du canvas d'overlay. Le `z-index` est structurel : l'effet de fond est (ré)appendu au
 * conteneur à chaque montage, donc après l'overlay dans l'ordre DOM ; sans z-index, la réaction
 * passerait derrière l'effet (bug trouvé en vérification live 2026-07-24).
 */
export const OVERLAY_CANVAS_STYLE = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;';

/**
 * État pur d'une réaction unique active à la fois.
 * @returns {{ trigger(type: string, now: number): boolean, sample(now: number): { type: string, progress: number } | null, readonly isActive: boolean }}
 */
export function createReactionScheduler() {
  /** @type {{ type: string, startTime: number, duration: number } | null} */
  let active = null;
  return {
    trigger(type, now) {
      const duration = reactionDuration(type);
      if (duration === null) return false;
      active = { type, startTime: now, duration };
      return true;
    },
    sample(now) {
      if (active === null) return null;
      const progress = (now - active.startTime) / active.duration;
      if (progress >= 1) { active = null; return null; }
      return { type: active.type, progress };
    },
    get isActive() { return active !== null; },
  };
}

/**
 * Boucle RAF paresseuse (sans DOM), pilotée par un ordonnanceur. Frames injectées pour les tests.
 * @param {{
 *   scheduler: ReturnType<typeof createReactionScheduler>,
 *   now: () => number,
 *   requestFrame: (cb: () => void) => number,
 *   cancelFrame: (id: number) => void,
 *   onFrame: (sample: { type: string, progress: number }) => void,
 *   onStop?: () => void,
 * }} deps
 */
export function createReactionLoop(deps) {
  let rafId = 0;
  let running = false;
  function step() {
    const sample = deps.scheduler.sample(deps.now());
    if (sample === null) { running = false; rafId = 0; deps.onStop?.(); return; }
    rafId = deps.requestFrame(step);
    deps.onFrame(sample);
  }
  return {
    /** @param {string} type */
    trigger(type) {
      if (!deps.scheduler.trigger(type, deps.now())) return false;
      if (!running) { running = true; rafId = deps.requestFrame(step); }
      return true;
    },
    stop() { if (rafId !== 0) deps.cancelFrame(rafId); rafId = 0; running = false; },
    get running() { return running; },
  };
}

/**
 * @param {{ color?: string, requestFrame?: (cb: () => void) => number, cancelFrame?: (id: number) => void, now?: () => number }} [options]
 * @returns {import('../types.js').ComponentInstance}
 */
export function ReactionOverlay(options = {}) {
  const requestFrame = options.requestFrame ?? ((cb) => requestAnimationFrame(cb));
  const cancelFrame = options.cancelFrame ?? ((id) => cancelAnimationFrame(id));
  const now = options.now ?? (() => performance.now());
  const rgb = resolveColor(options.color ?? 'var(--color-gold)');

  const canvas = document.createElement('canvas');
  canvas.style.cssText = OVERLAY_CANVAS_STYLE;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  let cssW = 0;
  let cssH = 0;
  let corner = { x: 0, y: 0 };
  /** @type {{ fx: number, fy: number, r: number, delay: number }[]} */
  let bits = [];

  const scheduler = createReactionScheduler();
  const loop = createReactionLoop({
    scheduler, now, requestFrame, cancelFrame,
    onFrame: render,
    onStop: () => ctx.clearRect(0, 0, cssW, cssH),
  });

  function resize() {
    const dpr = canvasPixelRatio();
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    if (w === 0 || h === 0) return;
    cssW = w; cssH = h;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** @param {{ type: string, progress: number }} sample */
  function render(sample) {
    ctx.clearRect(0, 0, cssW, cssH);
    const [r, g, b] = rgb;
    if (sample.type === 'follow') {
      const diagonal = Math.hypot(cssW, cssH);
      const radius = followRadius(sample.progress, diagonal);
      ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - sample.progress) * 0.9})`;
      ctx.lineWidth = (1 - sample.progress) * 3 + 0.5;
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (sample.type === 'sub') {
      ctx.fillStyle = `rgba(${r},${g},${b},${pulseAlpha(sample.progress).toFixed(3)})`;
      ctx.fillRect(0, 0, cssW, cssH);
    } else if (sample.type === 'raid') {
      const bandWidth = cssW * 0.15;
      const center = raidBandCenter(sample.progress, cssW, bandWidth);
      const gradient = ctx.createLinearGradient(center - bandWidth / 2, 0, center + bandWidth / 2, 0);
      gradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
      gradient.addColorStop(0.5, `rgba(${r},${g},${b},0.5)`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(center - bandWidth / 2, 0, bandWidth, cssH);
    } else if (sample.type === 'bits') {
      for (const bit of bits) {
        const local = Math.max(0, Math.min(1, (sample.progress - bit.delay) / (1 - bit.delay)));
        const alpha = pulseAlpha(local, 0.9);
        if (alpha <= 0) continue;
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(bit.fx * cssW, bit.fy * cssH, bit.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  return {
    el: canvas,
    /** @param {unknown} event */
    trigger(event) {
      const type = /** @type {{ type?: string }} */ (event ?? {}).type;
      if (typeof type !== 'string' || reactionDuration(type) === null) return;
      if (cssW === 0) resize();
      if (type === 'follow') {
        corner = { x: Math.random() < 0.5 ? 0 : cssW, y: Math.random() < 0.5 ? 0 : cssH };
      } else if (type === 'bits') {
        const count = bitsCount();
        bits = Array.from({ length: count }, () => ({
          fx: Math.random(), fy: Math.random(), r: 1.5 + Math.random() * 2.5, delay: Math.random() * 0.4,
        }));
      }
      loop.trigger(type);
    },
    destroy() {
      loop.stop();
      observer.disconnect();
    },
  };
}
