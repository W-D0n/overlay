// @ts-check
import { resolveColor } from './color-utils.js';
import { defineCanvasLayer } from './canvas-layer.js';
import { createAudioReaction } from './audio-reaction.js';

/**
 * @typedef {object} RainBackgroundOptions
 * @property {number} [intensity] - densité des gouttes, 0-1 (défaut 0.5)
 * @property {number} [speed] - vitesse de chute, multiplicateur (défaut 1)
 * @property {string} [color] - couleur des gouttes, token CSS ou valeur brute (défaut var(--color-gold))
 * @property {number} [angle] - inclinaison du vent en degrés (défaut 8)
 */
/**
 * RainBackground.js — Effet de fond « pluie » ambiante (Track B, session B3).
 *
 * Inspiration technique : CodePen vishwaoffl (CSS rain) — réinterprété en canvas/rAF (même pattern
 * que `DotGridAnimated.js`) et sans interaction souris : une Browser Source OBS n'a pas de curseur
 * (`pointer-events: none` partout), l'effet est donc strictement ambiant (voir
 * docs/specs/background-effects-library.md §Exclu).
 */
export const RainBackground = defineCanvasLayer((/** @type {RainBackgroundOptions} */ options = {}) => {
  let intensity = clamp(options.intensity ?? 0.5, 0, 1);
  let speed = options.speed ?? 1;
  let color = options.color ?? 'var(--color-gold)';
  let angle = options.angle ?? 8;
  const audio = createAudioReaction(options);

  let cssW = 0;
  let cssH = 0;
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
    // couvrir le viewport. À 90°, le coût maximal reste borné à ~1,5× sur un canvas de la résolution de référence.
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

  return {
    resize(size) {
      cssW = size.width;
      cssH = size.height;
      seedDrops();
    },

    draw(ctx, { dt }) {
      const dx = Math.sin((angle * Math.PI) / 180);
      const [r, g, b] = rgb;
      for (const d of drops) {
        ctx.strokeStyle = `rgba(${r},${g},${b},${d.opacity.toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + dx * d.len, d.y + d.len);
        ctx.stroke();
        // Le son accélère la chute sans jamais la ralentir.
        const audioSpeed = speed * audio.boost('level', 0.8);
        d.x += dx * d.vy * audioSpeed * dt;
        d.y += d.vy * audioSpeed * dt;
        if (d.y > cssH) {
          d.y = -d.len;
          d.x = spawnX();
        }
      }
    },

    /** @param {unknown} newOptions */
    update(newOptions) {
      const o = /** @type {Record<string, unknown>} */ (newOptions ?? {});
      if (typeof o.intensity === 'number') { intensity = clamp(o.intensity, 0, 1); seedDrops(); }
      if (typeof o.speed === 'number') speed = o.speed;
      if (typeof o.angle === 'number' && o.angle !== angle) { angle = o.angle; seedDrops(); }
      if (typeof o.color === 'string' && o.color !== color) { color = o.color; rgb = resolveColor(color); }
      audio.readOptions(o);
    },

    /**
     * Le niveau général accélère la chute de la pluie.
     * @param {import('../audio-levels.js').AudioLevels} levels
     */
    setAudioLevel(levels) {
      audio.apply(levels);
    },
  };
});

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
