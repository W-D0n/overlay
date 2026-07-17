// @ts-check
import { resolveColor } from './color-utils.js';
import { canvasPixelRatio } from './canvas-runtime.js';

/**
 * WaterRippleBackground.js — Gouttes qui tombent puis propagent des ondes à la surface de l'eau.
 *
 * Un seul canvas contient les deux couches visuelles (chute + propagation), conformément au mode
 * background-only : aucune superposition de Browser Sources ou d'effets externes. L'animation est
 * intégrée avec un delta-temps borné, donc sa vitesse ne dépend pas du framerate du navigateur/OBS.
 *
 * @param {{
 *   shape?: 'circle' | 'ellipse' | 'diamond',
 *   frequency?: number, - impacts par seconde (défaut 0.8)
 *   speed?: number,     - multiplicateur temporel global (défaut 1)
 *   amplitude?: number, - intensité visuelle des ondes, 0-1 (défaut 0.7)
 *   color?: string,     - couleur CSS des gouttes et ondes (défaut var(--color-gold))
 *   maxRadius?: number, - rayon maximal d'une onde en px (défaut 180)
 *   lineWidth?: number, - épaisseur des ondes en px (défaut 1.5)
 * }} [options]
 * @returns {import('../types.js').ComponentInstance}
 */
export function WaterRippleBackground(options = {}) {
  let shape = isRippleShape(options.shape) ? options.shape : 'ellipse';
  let frequency = Math.max(0, options.frequency ?? 0.8);
  let speed = Math.max(0, options.speed ?? 1);
  let amplitude = clamp(options.amplitude ?? 0.7, 0, 1);
  let color = options.color ?? 'var(--color-gold)';
  let maxRadius = Math.max(1, options.maxRadius ?? 180);
  let lineWidth = Math.max(0.1, options.lineWidth ?? 1.5);

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  let cssW = 0;
  let cssH = 0;
  let rafId = 0;
  let previousTimestamp = 0;
  let spawnBudget = 1;
  let rgb = resolveColor(color);

  /**
   * `age` est un temps d'animation intégré : changer `speed` ne téléporte pas les événements
   * existants, il accélère simplement leur progression à partir de la frame suivante.
   * @typedef {{x:number,impactY:number,dropDistance:number,fallDuration:number,age:number}} RippleEvent
   */
  /** @type {RippleEvent[]} */
  let events = [];

  function spawn() {
    if (cssW === 0 || cssH === 0) return;
    events.push({
      x: cssW * (0.06 + Math.random() * 0.88),
      impactY: cssH * (0.12 + Math.random() * 0.76),
      dropDistance: 70 + Math.random() * 130,
      fallDuration: 0.45 + Math.random() * 0.45,
      age: 0,
    });
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
    events = [];
    previousTimestamp = 0;
    spawnBudget = 1;
    if (rafId !== 0) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  /** @param {RippleEvent} event */
  function drawFallingDrop(event) {
    const progress = clamp(event.age / event.fallDuration, 0, 1);
    const eased = progress * progress;
    const y = event.impactY - event.dropDistance * (1 - eased);
    const [r, g, b] = rgb;

    ctx.beginPath();
    ctx.moveTo(event.x, y - 10);
    ctx.lineTo(event.x, y + 3);
    ctx.lineWidth = Math.max(1, lineWidth);
    ctx.strokeStyle = `rgba(${r},${g},${b},${(0.35 + amplitude * 0.5).toFixed(3)})`;
    ctx.stroke();
  }

  /** @param {RippleEvent} event */
  function drawRipple(event) {
    const waveAge = event.age - event.fallDuration;
    const radius = waveAge * RIPPLE_SPEED;
    if (radius < 0 || radius > maxRadius) return;

    const [r, g, b] = rgb;
    const life = rippleEnvelope(radius / maxRadius, amplitude);
    const ringSpacing = 12 + amplitude * 16;

    for (let ring = 0; ring < 3; ring++) {
      const ringRadius = radius - ring * ringSpacing;
      if (ringRadius <= 0) continue;
      const alpha = life * (1 - ring * 0.22);
      ctx.beginPath();
      traceRippleShape(ctx, shape, event.x, event.impactY, ringRadius);
      ctx.lineWidth = lineWidth * (1 + amplitude * 0.8) * (1 - ring * 0.18);
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
      ctx.stroke();
    }
  }

  function tick(timestamp) {
    rafId = requestAnimationFrame(tick);
    const rawDelta = previousTimestamp === 0 ? 0 : (timestamp - previousTimestamp) / 1000;
    const delta = Math.min(Math.max(rawDelta, 0), 0.1);
    previousTimestamp = timestamp;

    spawnBudget += delta * frequency * speed;
    while (spawnBudget >= 1) {
      spawn();
      spawnBudget -= 1;
    }

    ctx.clearRect(0, 0, cssW, cssH);
    const maxWaveAge = maxRadius / RIPPLE_SPEED;
    for (const event of events) {
      event.age += delta * speed;
      if (event.age < event.fallDuration) drawFallingDrop(event);
      else drawRipple(event);
    }
    events = events.filter((event) => event.age <= event.fallDuration + maxWaveAge);
  }

  const observer = new ResizeObserver(handleResize);
  observer.observe(canvas);

  return {
    el: canvas,
    /** @param {unknown} newOptions */
    update(newOptions) {
      const next = /** @type {Record<string, unknown>} */ (newOptions ?? {});
      if (isRippleShape(next.shape)) shape = next.shape;
      if (typeof next.frequency === 'number') frequency = Math.max(0, next.frequency);
      if (typeof next.speed === 'number') speed = Math.max(0, next.speed);
      if (typeof next.amplitude === 'number') amplitude = clamp(next.amplitude, 0, 1);
      if (typeof next.maxRadius === 'number') maxRadius = Math.max(1, next.maxRadius);
      if (typeof next.lineWidth === 'number') lineWidth = Math.max(0.1, next.lineWidth);
      if (typeof next.color === 'string' && next.color !== color) {
        color = next.color;
        rgb = resolveColor(color);
      }
    },
    destroy() {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    },
  };
}

const RIPPLE_SPEED = 92;
export const WATER_RIPPLE_SHAPES = /** @type {const} */ (['circle', 'ellipse', 'diamond']);

/** @param {unknown} value @returns {value is typeof WATER_RIPPLE_SHAPES[number]} */
function isRippleShape(value) {
  return typeof value === 'string'
    && /** @type {readonly string[]} */ (WATER_RIPPLE_SHAPES).includes(value);
}

/**
 * Enveloppe d'amplitude : attaque douce, puis extinction quadratique sans alpha négatif.
 * @param {number} progress - rayon courant / rayon maximum
 * @param {number} amplitude - 0-1
 */
export function rippleEnvelope(progress, amplitude) {
  const p = clamp(progress, 0, 1);
  const attack = Math.min(1, p * 8);
  return clamp(amplitude, 0, 1) * attack * (1 - p) ** 2;
}

/**
 * @param {CanvasRenderingContext2D} context
 * @param {typeof WATER_RIPPLE_SHAPES[number]} rippleShape
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 */
function traceRippleShape(context, rippleShape, x, y, radius) {
  if (rippleShape === 'circle') {
    context.arc(x, y, radius, 0, Math.PI * 2);
    return;
  }
  if (rippleShape === 'diamond') {
    const vertical = radius * 0.48;
    context.moveTo(x, y - vertical);
    context.lineTo(x + radius, y);
    context.lineTo(x, y + vertical);
    context.lineTo(x - radius, y);
    context.closePath();
    return;
  }
  context.ellipse(x, y, radius, radius * 0.38, 0, 0, Math.PI * 2);
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
