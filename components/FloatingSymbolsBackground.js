// @ts-check
import { resolveColor } from './color-utils.js';
import { defineCanvasLayer } from './canvas-layer.js';
import { createAudioReaction } from './audio-reaction.js';

/**
 * @typedef {object} FloatingSymbolsBackgroundOptions
 * @property {string} [symbol] - glyphe/emoji affiché (défaut '✽')
 * @property {number} [count] - nombre de symboles simultanés (défaut 12)
 * @property {number} [speed] - vitesse de chute, multiplicateur (défaut 1)
 * @property {string} [color] - couleur des symboles, token CSS ou valeur brute (défaut var(--color-gold))
 * @property {number} [minSize] - taille minimum en px (défaut 24)
 * @property {number} [maxSize] - taille maximum en px (défaut 64)
 */
/**
 * FloatingSymbolsBackground.js — Glyphes/emoji flottants configurables (Track B, session B5).
 *
 * Inspiration technique : CodePen wakana-k (Foil Stamping Effect) — généralisée SANS texture
 * externe (le pen source utilise une image foil métallique chargée depuis Unsplash ; ce projet est
 * zero-dépendance, voir docs/specs/background-effects-library.md §Exclu) : couleur unie/token à la
 * place. Le « motif » demandé par l'owner devient le champ `symbol` (un caractère ou emoji), pas
 * une texture — configurable dès la v1.
 */
export const FloatingSymbolsBackground = defineCanvasLayer((/** @type {FloatingSymbolsBackgroundOptions} */ options = {}) => {
  let symbol = options.symbol ?? '✽';
  let count = Math.max(1, Math.round(options.count ?? 12));
  let speed = options.speed ?? 1;
  let color = options.color ?? 'var(--color-gold)';
  let minSize = options.minSize ?? 24;
  let maxSize = options.maxSize ?? 64;
  const audio = createAudioReaction(options);

  let cssW = 0;
  let cssH = 0;
  let rgb = resolveColor(color);

  /** @typedef {{x:number,y:number,size:number,font:string,vy:number,rotPhase:number,rotSpeed:number,opacity:number}} Sym */
  /** @type {Sym[]} */
  let symbols = [];

  /** @returns {Sym} */
  function spawn(randomY = true) {
    const size = minSize + Math.random() * (maxSize - minSize);
    return {
      x: Math.random() * cssW,
      y: randomY ? Math.random() * cssH : -maxSize,
      size,
      font: `${size}px sans-serif`, // précalculé une fois — `size` fixe pour la durée de vie du symbole, jamais recalculé par frame (voir tick)
      vy: (0.3 + Math.random() * 0.5) * 60,
      rotPhase: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.02 * 60,
      opacity: 0.15 + Math.random() * 0.25,
    };
  }

  function seed() {
    symbols = Array.from({ length: count }, () => spawn(true));
  }

  return {
    resize(size) {
      cssW = size.width;
      cssH = size.height;
      seed();
    },

    draw(ctx, { dt }) {
      const [r, g, b] = rgb;

      for (let i = 0; i < symbols.length; i++) {
        const s = symbols[i];
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rotPhase);
        ctx.font = s.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(${r},${g},${b},${s.opacity.toFixed(3)})`;
        ctx.fillText(symbol, 0, 0);
        ctx.restore();

        // Le son accélère la dérive et la rotation des symboles, sans changer leur trajectoire.
        const audioSpeed = speed * audio.boost('level', 0.9);
        s.y += s.vy * audioSpeed * dt;
        s.rotPhase += s.rotSpeed * audioSpeed * dt;
        if (s.y - s.size > cssH) symbols[i] = spawn(false);
      }
    },

    /** @param {unknown} newOptions */
    update(newOptions) {
      const o = /** @type {Record<string, unknown>} */ (newOptions ?? {});
      if (typeof o.symbol === 'string') symbol = o.symbol;
      if (typeof o.speed === 'number') speed = o.speed;
      if (typeof o.minSize === 'number') minSize = o.minSize;
      if (typeof o.maxSize === 'number') maxSize = o.maxSize;
      if (typeof o.color === 'string' && o.color !== color) { color = o.color; rgb = resolveColor(color); }
      if (typeof o.count === 'number' && Math.round(o.count) !== count) {
        count = Math.max(1, Math.round(o.count));
        seed();
      }
      audio.readOptions(o);
    },
    /**
     * Le niveau accélère la dérive des symboles.
     * @param {import('../audio-levels.js').AudioLevels} levels
     */
    setAudioLevel(levels) {
      audio.apply(levels);
    },
  };
});
