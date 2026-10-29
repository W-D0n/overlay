// @ts-check
import { resolveColor } from './color-utils.js';
import { chanceForDelta } from './animation-time.js';
import { defineCanvasLayer } from './canvas-layer.js';
import { createPhase } from '../render-clock.js';
import { createAudioReaction } from './audio-reaction.js';

/**
 * @typedef {object} FirefliesBackgroundOptions
 * @property {number} [count] - nombre de lucioles (défaut 25)
 * @property {number} [speed] - vitesse de dérive, multiplicateur (défaut 1)
 * @property {string} [color] - couleur des lucioles, token CSS ou valeur brute (défaut var(--color-gold))
 * @property {number} [flashChance] - probabilité de déclencher un flash par frame et par luciole (défaut 0.006)
 */
/**
 * FirefliesBackground.js — Particules lumineuses dérivantes, avec flash (Track B, session B4).
 *
 * Inspiration technique : CodePen mikegolus (CSS Fireflies) — portée en canvas/rAF (même pattern
 * que `DotGridAnimated.js`) : chaque luciole dérive selon une trajectoire lissajous individuelle
 * (fréquences/phases propres, comme la Couche 1 de DotGrid) et émet des flashs lumineux
 * intermittents plutôt qu'une opacité constante.
 */
export const FirefliesBackground = defineCanvasLayer((/** @type {FirefliesBackgroundOptions} */ options = {}) => {
  let count = Math.max(1, Math.round(options.count ?? 25));
  let speed = options.speed ?? 1;
  let color = options.color ?? 'var(--color-gold)';
  let flashChance = options.flashChance ?? 0.006;
  const audio = createAudioReaction(options);

  let cssW = 0;
  let cssH = 0;
  let rgb = resolveColor(color);

  const FLASH_DURATION = 40 / 60;

  /** @typedef {{cx:number,cy:number,radiusX:number,radiusY:number,freqX:number,freqY:number,phase:number,baseOpacity:number,flashT:number}} Firefly */
  /** @type {Firefly[]} */
  let flies = [];
  /** Temps d'errance, intégré : un changement de vitesse n'affecte que l'avenir. */
  const drift = createPhase();

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

  return {
    resize(size) {
      cssW = size.width;
      cssH = size.height;
      seed();
    },

    draw(ctx, { dt }) {
      const t = drift.advance(dt * speed * audio.boost('level', 0.5));
      const [r, g, b] = rgb;

      for (const fly of flies) {
        const x = fly.cx + Math.sin(t * fly.freqX + fly.phase) * fly.radiusX;
        const y = fly.cy + Math.cos(t * fly.freqY + fly.phase) * fly.radiusY;

        // L'aigu fait scintiller : c'est la bande qui porte les consonnes et les percussions.
        const audioChance = flashChance * audio.boost('treble', 6);
        if (fly.flashT === 0 && Math.random() < chanceForDelta(audioChance, dt)) {
          fly.flashT = FLASH_DURATION;
        }

        let opacity = fly.baseOpacity;
        let glowRadius = 2;
        if (fly.flashT > 0) {
          const progress = fly.flashT / FLASH_DURATION;
          opacity = fly.baseOpacity + 0.85 * Math.sin(progress * Math.PI); // monte puis redescend
          glowRadius = 2 + 6 * Math.sin(progress * Math.PI);
          fly.flashT = Math.max(0, fly.flashT - dt);
        }

        ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, opacity).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    },

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
      audio.readOptions(o);
    },
    /**
     * L'aigu multiplie les éclats, le niveau élargit l'errance des lucioles.
     * @param {import('../audio-levels.js').AudioLevels} levels
     */
    setAudioLevel(levels) {
      audio.apply(levels);
    },
  };
});
