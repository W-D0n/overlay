// @ts-check
import { resolveColor } from './color-utils.js';

/**
 * StarsParallaxBackground.js — Champ d'étoiles en parallaxe, 3 couches (Track B, session B6).
 *
 * Inspiration technique : CodePen sarazond (parallax stars) — positions générées PROCÉDURALEMENT
 * en JS au montage (`generateStarLayer`), pas des centaines de valeurs `box-shadow` codées en dur
 * comme le CodePen source (LAC-03 de `docs/specs/background-effects-library.md` : composante
 * non-déterministe acceptée, pas besoin de reproductibilité pixel-perfect entre deux lancements).
 *
 * @param {{
 *   color?: string,   - couleur des étoiles, token CSS ou valeur brute (défaut '#ffffff')
 *   density?: number, - étoiles par 10 000px² sur la couche la plus dense (défaut 0.06)
 *   speed?: number,   - vitesse de défilement, multiplicateur (défaut 1)
 * }} [options]
 * @returns {import('../types.js').ComponentInstance}
 */
export function StarsParallaxBackground(options = {}) {
  let color = options.color ?? '#ffffff';
  let density = options.density ?? 0.06;
  let speed = options.speed ?? 1;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  let cssW = 0;
  let cssH = 0;
  let rafId = 0;
  let rgb = resolveColor(color);

  /** Trois couches, vitesse/rayon/opacité croissants avec la profondeur apparente. */
  const LAYER_DEFS = [
    { speedMul: 0.2, radius: 0.6, opacity: 0.4, densityMul: 1.0 },
    { speedMul: 0.5, radius: 1.0, opacity: 0.65, densityMul: 0.6 },
    { speedMul: 1.0, radius: 1.6, opacity: 0.9, densityMul: 0.3 },
  ];

  /** @type {{x:number,y:number}[][]} */
  let layers = [];

  function seed() {
    layers = LAYER_DEFS.map((def) => generateStarLayer(Math.round(cssW * cssH * density * def.densityMul / 10000), cssW, cssH));
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

  function tick(timestamp) {
    rafId = requestAnimationFrame(tick);
    ctx.clearRect(0, 0, cssW, cssH);
    const [r, g, b] = rgb;

    layers.forEach((stars, i) => {
      const def = LAYER_DEFS[i];
      const offset = (timestamp * 0.02 * speed * def.speedMul) % cssH;
      ctx.fillStyle = `rgba(${r},${g},${b},${def.opacity})`;
      for (const star of stars) {
        const y = (star.y + offset) % cssH;
        ctx.beginPath();
        ctx.arc(star.x, y, def.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  const observer = new ResizeObserver(handleResize);
  observer.observe(canvas);

  return {
    el: canvas,
    /** @param {unknown} newOptions */
    update(newOptions) {
      const o = /** @type {Record<string, unknown>} */ (newOptions ?? {});
      if (typeof o.speed === 'number') speed = o.speed;
      if (typeof o.color === 'string' && o.color !== color) { color = o.color; rgb = resolveColor(color); }
      if (typeof o.density === 'number' && o.density !== density) { density = o.density; seed(); }
    },
    destroy() {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    },
  };
}

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
