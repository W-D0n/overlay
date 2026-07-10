// @ts-check
import { resolveColor } from './color-utils.js';

/**
 * FloatingSymbolsBackground.js — Glyphes/emoji flottants configurables (Track B, session B5).
 *
 * Inspiration technique : CodePen wakana-k (Foil Stamping Effect) — généralisée SANS texture
 * externe (le pen source utilise une image foil métallique chargée depuis Unsplash ; ce projet est
 * zero-dépendance, voir docs/specs/background-effects-library.md §Exclu) : couleur unie/token à la
 * place. Le « motif » demandé par l'owner devient le champ `symbol` (un caractère ou emoji), pas
 * une texture — configurable dès la v1.
 *
 * @param {{
 *   symbol?: string,   - glyphe/emoji affiché (défaut '✽')
 *   count?: number,     - nombre de symboles simultanés (défaut 12)
 *   speed?: number,     - vitesse de chute, multiplicateur (défaut 1)
 *   color?: string,     - couleur des symboles, token CSS ou valeur brute (défaut var(--color-gold))
 *   minSize?: number,   - taille minimum en px (défaut 24)
 *   maxSize?: number,   - taille maximum en px (défaut 64)
 * }} [options]
 * @returns {import('../types.js').ComponentInstance}
 */
export function FloatingSymbolsBackground(options = {}) {
  let symbol = options.symbol ?? '✽';
  let count = Math.max(1, Math.round(options.count ?? 12));
  let speed = options.speed ?? 1;
  let color = options.color ?? 'var(--color-gold)';
  let minSize = options.minSize ?? 24;
  let maxSize = options.maxSize ?? 64;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  let cssW = 0;
  let cssH = 0;
  let rafId = 0;
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
      vy: (0.3 + Math.random() * 0.5) * speed,
      rotPhase: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.02,
      opacity: 0.15 + Math.random() * 0.25,
    };
  }

  function seed() {
    symbols = Array.from({ length: count }, () => spawn(true));
  }

  function handleResize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    if (w === 0 || h === 0) return;
    cssW = w;
    cssH = h;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    seed();
    if (rafId !== 0) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function tick() {
    rafId = requestAnimationFrame(tick);
    ctx.clearRect(0, 0, cssW, cssH);
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

      s.y += s.vy;
      s.rotPhase += s.rotSpeed;
      if (s.y - s.size > cssH) symbols[i] = spawn(false);
    }
  }

  const observer = new ResizeObserver(handleResize);
  observer.observe(canvas);

  return {
    el: canvas,
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
    },
    destroy() {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    },
  };
}
