// @ts-check
import { resolveColor } from './color-utils.js';
import { defineCanvasLayer } from './canvas-layer.js';
import { isAudioOn } from '../layer-kinds.js';
import { isAudioPeak } from '../audio-levels.js';

/**
 * @typedef {object} WaterRippleBackgroundOptions
 * @property {'circle' | 'ellipse' | 'diamond'} [shape]
 * @property {number} [frequency] - impacts par seconde (défaut 0.8)
 * @property {boolean} [audioReactive] - engendrer une goutte à chaque pic sonore (défaut false)
 * @property {number} [audioIntensity] - amplitude de la réaction audio (défaut 1)
 * @property {number} [speed] - multiplicateur temporel global (défaut 1)
 * @property {number} [amplitude] - intensité visuelle des ondes, 0-1 (défaut 0.7)
 * @property {string} [color] - couleur CSS des gouttes et ondes (défaut var(--color-gold))
 * @property {number} [maxRadius] - rayon maximal d'une onde en px (défaut 180)
 * @property {number} [lineWidth] - épaisseur des ondes en px (défaut 1.5)
 */
/**
 * WaterRippleBackground.js — Gouttes qui tombent puis propagent des ondes à la surface de l'eau.
 *
 * Un seul canvas contient les deux couches visuelles (chute + propagation), conformément au mode
 * background-only : aucune superposition de Browser Sources ou d'effets externes. L'animation est
 * intégrée avec un delta-temps borné, donc sa vitesse ne dépend pas du framerate du navigateur/OBS.
 */
export const WaterRippleBackground = defineCanvasLayer((/** @type {WaterRippleBackgroundOptions} */ options = {}) => {
  let shape = isRippleShape(options.shape) ? options.shape : 'ellipse';
  let frequency = Math.max(0, options.frequency ?? 0.8);
  let speed = Math.max(0, options.speed ?? 1);
  let amplitude = clamp(options.amplitude ?? 0.7, 0, 1);
  let color = options.color ?? 'var(--color-gold)';
  let maxRadius = Math.max(1, options.maxRadius ?? 180);
  let lineWidth = Math.max(0.1, options.lineWidth ?? 1.5);
  let audioIntensity = Math.max(0, options.audioIntensity ?? 1);
  let previousAudioLevel = 0;

  let cssW = 0;
  let cssH = 0;
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

  /** @param {CanvasRenderingContext2D} ctx @param {RippleEvent} event */
  function drawFallingDrop(ctx, event) {
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

  /** @param {CanvasRenderingContext2D} ctx @param {RippleEvent} event */
  function drawRipple(ctx, event) {
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

  return {
    resize(size) {
      cssW = size.width;
      cssH = size.height;
      events = [];
      spawnBudget = 1;
    },

    draw(ctx, { dt }) {
      spawnBudget += dt * frequency * speed;
      while (spawnBudget >= 1) {
        spawn();
        spawnBudget -= 1;
      }

      const maxWaveAge = maxRadius / RIPPLE_SPEED;
      for (const event of events) {
        event.age += dt * speed;
        if (event.age < event.fallDuration) drawFallingDrop(ctx, event);
        else drawRipple(ctx, event);
      }
      events = events.filter((event) => event.age <= event.fallDuration + maxWaveAge);
    },

    /** @param {unknown} newOptions */
    update(newOptions) {
      const next = /** @type {Record<string, unknown>} */ (newOptions ?? {});
      if (isRippleShape(next.shape)) shape = next.shape;
      if (typeof next.frequency === 'number') frequency = Math.max(0, next.frequency);
      if (typeof next.speed === 'number') speed = Math.max(0, next.speed);
      if (typeof next.amplitude === 'number') amplitude = clamp(next.amplitude, 0, 1);
      if (typeof next.maxRadius === 'number') maxRadius = Math.max(1, next.maxRadius);
      if (typeof next.lineWidth === 'number') lineWidth = Math.max(0.1, next.lineWidth);
      if (typeof next.audioIntensity === 'number' && next.audioIntensity >= 0) audioIntensity = next.audioIntensity;
      if (next.audioReactive !== undefined && !isAudioOn(next.audioReactive)) previousAudioLevel = 0;
      if (typeof next.color === 'string' && next.color !== color) {
        color = next.color;
        rgb = resolveColor(color);
      }
    },
    /**
     * Une goutte par pic sonore, en plus de la fréquence réglée. `audioIntensity` module le nombre
     * de gouttes par pic : c'est le lien son → image le plus lisible de la bibliothèque.
     * @param {import('../audio-levels.js').AudioLevels} levels
     */
    setAudioLevel(levels) {
      const level = typeof levels?.level === 'number' && Number.isFinite(levels.level)
        ? clamp(levels.level, 0, 1)
        : 0;
      if (isAudioPeak(previousAudioLevel, level)) {
        const drops = Math.max(1, Math.round(audioIntensity));
        for (let i = 0; i < drops; i += 1) spawn();
      }
      previousAudioLevel = level;
    },
  };
});

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
