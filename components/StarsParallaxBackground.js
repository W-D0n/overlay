// @ts-check
import { resolveColor } from './color-utils.js';
import { defineCanvasLayer } from './canvas-layer.js';
import { createPhase } from '../render-clock.js';
import { createAudioReaction } from './audio-reaction.js';

/**
 * @typedef {object} StarsParallaxBackgroundOptions
 * @property {string} [color] - couleur des étoiles, token CSS ou valeur brute (défaut '#ffffff')
 * @property {number} [density] - étoiles par 10 000px² sur la couche la plus dense (défaut 0.06)
 * @property {number} [speed] - vitesse de défilement, multiplicateur (défaut 1)
 */
/**
 * StarsParallaxBackground.js — Champ d'étoiles en parallaxe, 3 couches (Track B, session B6).
 *
 * Inspiration technique : CodePen sarazond (parallax stars) — positions générées PROCÉDURALEMENT
 * en JS au montage (`generateStarLayer`), pas des centaines de valeurs `box-shadow` codées en dur
 * comme le CodePen source (LAC-03 de `docs/specs/background-effects-library.md` : composante
 * non-déterministe acceptée, pas besoin de reproductibilité pixel-perfect entre deux lancements).
 */
export const StarsParallaxBackground = defineCanvasLayer((/** @type {StarsParallaxBackgroundOptions} */ options = {}) => {
  let color = options.color ?? '#ffffff';
  let density = options.density ?? 0.06;
  let speed = options.speed ?? 1;
  const audio = createAudioReaction(options);

  let cssW = 0;
  let cssH = 0;
  let rgb = resolveColor(color);

  /** Trois couches, vitesse/rayon/opacité croissants avec la profondeur apparente. */
  const LAYER_DEFS = [
    { speedMul: 0.2, radius: 0.6, opacity: 0.4, densityMul: 1.0 },
    { speedMul: 0.5, radius: 1.0, opacity: 0.65, densityMul: 0.6 },
    { speedMul: 1.0, radius: 1.6, opacity: 0.9, densityMul: 0.3 },
  ];

  /** Défilement en px/s par couche, intégré : un changement de vitesse n'affecte que l'avenir. */
  const SCROLL_PX_PER_SECOND = 20;
  const scrolls = LAYER_DEFS.map(() => createPhase());

  /** @type {{x:number,y:number}[][]} */
  let layers = [];

  function seed() {
    layers = LAYER_DEFS.map((def) => generateStarLayer(Math.round(cssW * cssH * density * def.densityMul / 10000), cssW, cssH));
  }

  return {
    resize(size) {
      cssW = size.width;
      cssH = size.height;
      seed();
    },

    draw(ctx, { dt }) {
      const [r, g, b] = rgb;
      layers.forEach((stars, i) => {
        const def = LAYER_DEFS[i];
        // Le niveau accélère le défilement : la profondeur se lit comme une accélération.
        const offset = scrolls[i].advance(dt * SCROLL_PX_PER_SECOND * speed * audio.boost('level', 1.1) * def.speedMul) % cssH;
        ctx.fillStyle = `rgba(${r},${g},${b},${def.opacity})`;
        for (const star of stars) {
          const y = (star.y + offset) % cssH;
          ctx.beginPath();
          ctx.arc(star.x, y, def.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },

    /** @param {unknown} newOptions */
    update(newOptions) {
      const o = /** @type {Record<string, unknown>} */ (newOptions ?? {});
      if (typeof o.speed === 'number') speed = o.speed;
      if (typeof o.color === 'string' && o.color !== color) { color = o.color; rgb = resolveColor(color); }
      if (typeof o.density === 'number' && o.density !== density) { density = o.density; seed(); }
      audio.readOptions(o);
    },

    /**
     * Le niveau accélère le défilement, comme une accélération de vitesse.
     * @param {import('../audio-levels.js').AudioLevels} levels
     */
    setAudioLevel(levels) {
      audio.apply(levels);
    },
  };
});

/**
 * Génère `count` positions d'étoiles aléatoires dans un rectangle `width` × `height`. Pure au sens
 * où elle ne touche ni DOM ni canvas — seule sa source d'aléa (`Math.random`) est non-déterministe
 * (LAC-03, accepté : pas de besoin de reproductibilité entre deux lancements).
 * @param {number} count
 * @param {number} width
 * @param {number} height
 * @returns {{x:number,y:number}[]}
 */
export function generateStarLayer(count, width, height) {
  return Array.from({ length: Math.max(0, count) }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
  }));
}
