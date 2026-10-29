// @ts-check
import { defineCanvasLayer } from './canvas-layer.js';
import { createAudioReaction } from './audio-reaction.js';
/**
 * ColorDropsBackground.js — Gouttes de couleur tombant verticalement (Track B, session B6).
 *
 * Inspiration technique : CodePen nefejames (color-drip) + natewiley (color-drops) — portée en
 * canvas/rAF (même pattern que `DotGridAnimated.js`/`RainBackground.js`). Différence avec
 * `RainBackground` : ici l'accent est la variété de couleurs par goutte (dégradé vers le bas,
 * palette multi-teintes), chute strictement verticale, pas d'inclinaison de vent.
 */
/**
 * @typedef {object} ColorDropsBackgroundOptions
 * @property {number} [count] - nombre de gouttes simultanées (défaut 24)
 * @property {number} [speed] - vitesse de chute, multiplicateur (défaut 1)
 * @property {string[]} [colors] - palette de couleurs, tokens CSS ou valeurs brutes (défaut palette Atelier)
 * @property {number} [length] - longueur de la traînée en px (défaut 90)
 */
import { resolveColor } from './color-utils.js';

export const ColorDropsBackground = defineCanvasLayer((/** @type {ColorDropsBackgroundOptions} */ options = {}) => {
  let count = Math.max(1, Math.round(options.count ?? 24));
  let speed = options.speed ?? 1;
  let colors = options.colors ?? ['var(--color-gold)', '#8A2BE2', '#1E90FF', '#DC143C'];
  let length = options.length ?? 90;
  const audio = createAudioReaction(options);

  let cssW = 0;
  let cssH = 0;
  /** @type {[number, number, number][]} */
  let rgbPalette = colors.map(resolveColor);
  /** @type {CanvasGradient[]} */
  let gradients = [];
  /** Les gradients se créent sur le contexte, disponible au premier dessin : reconstruits quand `colors`/`length` changent. */
  let gradientsStale = true;

  /**
   * Un gradient par couleur de palette, en coordonnées LOCALES `(0,-length)` → `(0,0)` — traduit
   * via `ctx.translate(d.x, d.y)` au dessin (voir `tick`) plutôt que recréé avec les coordonnées
   * absolues de chaque goutte. `createLinearGradient`/`addColorStop` recréaient un objet canvas par
   * goutte à CHAQUE frame (jusqu'à `count`×60/s) — coût CPU superflu en contexte stream (OBS +
   * encodage + jeu se partagent déjà la machine), alors que seules `colors`/`length` en changent le
   * résultat. À reconstruire uniquement quand l'un des deux change (voir `update`).
   * @param {CanvasRenderingContext2D} ctx
   */
  function buildGradients(ctx) {
    gradients = rgbPalette.map(([r, g, b]) => {
      const grad = ctx.createLinearGradient(0, -length, 0, 0);
      grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0.35)`);
      return grad;
    });
  }

  /** @typedef {{x:number,y:number,vy:number,colorIdx:number,width:number}} Drop */
  /** @type {Drop[]} */
  let drops = [];

  /** @returns {Drop} */
  function spawn(randomY = true) {
    return {
      x: Math.random() * cssW,
      y: randomY ? Math.random() * cssH : -length,
      vy: (1.5 + Math.random() * 2.5) * 60,
      colorIdx: Math.floor(Math.random() * rgbPalette.length),
      width: 0.5 + Math.random() * 1.2,
    };
  }

  function seed() {
    drops = Array.from({ length: count }, () => spawn(true));
  }

  return {
    resize(size) {
      cssW = size.width;
      cssH = size.height;
      seed();
    },

    draw(ctx, { dt }) {
      if (gradientsStale) {
        buildGradients(ctx);
        gradientsStale = false;
      }

      // Un pic sonore relance la goutte la plus basse en haut de l'écran : le son se voit tomber.
      if (audio.consumePeak() && drops.length > 0) {
        let lowest = 0;
        for (let i = 1; i < drops.length; i += 1) if (drops[i].y > drops[lowest].y) lowest = i;
        drops[lowest] = spawn(false);
      }

      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        ctx.save();
        ctx.translate(d.x, d.y);
        const [r, g, b] = rgbPalette[d.colorIdx] ?? [200, 185, 122];
        ctx.strokeStyle = gradients[d.colorIdx] ?? `rgba(${r},${g},${b},0.35)`;
        ctx.lineWidth = d.width;
        ctx.beginPath();
        ctx.moveTo(0, -length);
        ctx.lineTo(0, 0);
        ctx.stroke();
        ctx.restore();

        d.y += d.vy * speed * audio.boost('level', 0.5) * dt;
        if (d.y - length > cssH) drops[i] = spawn(false);
      }
    },

    /** @param {unknown} newOptions */
    update(newOptions) {
      const o = /** @type {Record<string, unknown>} */ (newOptions ?? {});
      if (typeof o.speed === 'number') speed = o.speed;
      if (typeof o.length === 'number' && o.length !== length) { length = o.length; gradientsStale = true; }
      if (Array.isArray(o.colors)) { colors = /** @type {string[]} */ (o.colors); rgbPalette = colors.map(resolveColor); gradientsStale = true; }
      if (typeof o.count === 'number' && Math.round(o.count) !== count) {
        count = Math.max(1, Math.round(o.count));
        seed();
      }
      audio.readOptions(o);
    },
    /**
     * Chaque pic sonore lâche une goutte de plus.
     * @param {import('../audio-levels.js').AudioLevels} levels
     */
    setAudioLevel(levels) {
      audio.apply(levels);
    },
  };
});
