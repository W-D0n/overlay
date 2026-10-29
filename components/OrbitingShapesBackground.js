// @ts-check
import { resolveColor } from './color-utils.js';
import { defineCanvasLayer } from './canvas-layer.js';
import { createPhase } from '../render-clock.js';
import { createAudioReaction } from './audio-reaction.js';

/**
 * @typedef {object} OrbitingShapesBackgroundOptions
 * @property {'circle' | 'triangle'} [shape]
 * @property {number} [count] - nombre de formes simultanées (défaut 10)
 * @property {number} [speed] - vitesse de rotation orbitale, multiplicateur (défaut 1)
 * @property {string} [color] - couleur des formes, token CSS ou valeur brute (défaut var(--color-gold))
 * @property {number} [minSize] - taille minimum en px, à profondeur maximale (défaut 8)
 * @property {number} [maxSize] - taille maximum en px, au plus proche (défaut 28)
 * @property {number} [opacity] - opacité globale, 0-1 (défaut 1)
 */
/**
 * OrbitingShapesBackground.js — Formes en orbite pseudo-3D (Track B, session B7).
 *
 * Consolide 3 CodePen en un seul composant paramétré par `shape` (nefejames floating-balls,
 * robdimarzo triangle-fusion, natewiley tri-travelers) : chaque forme orbite autour d'un centre
 * propre sur une ellipse aplatie, avec échelle/opacité liées à la phase de l'orbite pour simuler
 * une profondeur (avant = grand/opaque, arrière = petit/discret) — même principe que
 * `natewiley` (translate3d + scale), porté en canvas 2D (pas de vrai 3D nécessaire ici).
 */
export const OrbitingShapesBackground = defineCanvasLayer((/** @type {OrbitingShapesBackgroundOptions} */ options = {}) => {
  let shape = options.shape ?? 'circle';
  let count = Math.max(1, Math.round(options.count ?? 10));
  let speed = options.speed ?? 1;
  let color = options.color ?? 'var(--color-gold)';
  let minSize = options.minSize ?? 8;
  let maxSize = options.maxSize ?? 28;
  let opacity = clamp(options.opacity ?? 1, 0, 1);
  const audio = createAudioReaction(options);

  let cssW = 0;
  let cssH = 0;
  let rgb = resolveColor(color);

  /** @typedef {{cx:number,cy:number,radiusX:number,radiusY:number,phase:number,angularSpeed:number,sizeRatio:number}} Orbiter */
  /** @type {Orbiter[]} */
  let orbiters = [];
  /** Temps orbital, intégré : un changement de vitesse n'affecte que l'avenir. */
  const orbit = createPhase();

  /** @returns {Orbiter} */
  function spawn() {
    return {
      cx: Math.random() * cssW,
      cy: Math.random() * cssH,
      radiusX: 40 + Math.random() * 160,
      radiusY: 20 + Math.random() * 80,
      phase: Math.random() * Math.PI * 2,
      angularSpeed: 0.3 + Math.random() * 0.5,
      // Conserver le ratio aléatoire, pas la taille calculée : modifier minSize/maxSize dans le
      // tuner redimensionne ainsi les formes existantes sans reseed ni saut de position.
      sizeRatio: Math.random(),
    };
  }

  function seed() {
    orbiters = Array.from({ length: count }, spawn);
  }

  /** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} size @param {number} rotation */
  function drawShape(ctx, cx, cy, size, rotation) {
    if (shape === 'triangle') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.87, size * 0.5);
      ctx.lineTo(-size * 0.87, size * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return {
    resize(size) {
      cssW = size.width;
      cssH = size.height;
      seed();
    },

    draw(ctx, { dt }) {
      const t = orbit.advance(dt * speed * audio.boost('level', 0.8));
      const [r, g, b] = rgb;

      for (const o of orbiters) {
        const angle = t * o.angularSpeed + o.phase;
        const depth = (Math.sin(angle) + 1) / 2; // 0 = fond, 1 = premier plan
        // Le grave écarte les formes de leur centre : l'orbite respire avec le son.
        const orbitBoost = audio.boost('bass', 0.35);
        const x = o.cx + Math.cos(angle) * o.radiusX * orbitBoost;
        const y = o.cy + Math.sin(angle) * o.radiusY * orbitBoost;
        const baseSize = minSize + o.sizeRatio * (maxSize - minSize);
        const size = baseSize * (0.4 + 0.6 * depth);
        const shapeOpacity = (0.15 + 0.55 * depth) * opacity;

        ctx.fillStyle = `rgba(${r},${g},${b},${shapeOpacity.toFixed(3)})`;
        drawShape(ctx, x, y, size, angle);
      }
    },

    /** @param {unknown} newOptions */
    update(newOptions) {
      const o = /** @type {Record<string, unknown>} */ (newOptions ?? {});
      if (o.shape === 'circle' || o.shape === 'triangle') shape = o.shape;
      if (typeof o.speed === 'number') speed = o.speed;
      if (typeof o.minSize === 'number') minSize = o.minSize;
      if (typeof o.maxSize === 'number') maxSize = o.maxSize;
      if (typeof o.opacity === 'number') opacity = clamp(o.opacity, 0, 1);
      if (typeof o.color === 'string' && o.color !== color) { color = o.color; rgb = resolveColor(color); }
      if (typeof o.count === 'number' && Math.round(o.count) !== count) {
        count = Math.max(1, Math.round(o.count));
        seed();
      }
      audio.readOptions(o);
    },
    /**
     * Le grave élargit les orbites, le niveau accélère la rotation.
     * @param {import('../audio-levels.js').AudioLevels} levels
     */
    setAudioLevel(levels) {
      audio.apply(levels);
    },
  };
});

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
