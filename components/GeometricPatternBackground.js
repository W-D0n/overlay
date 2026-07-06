// @ts-check
/**
 * GeometricPatternBackground.js — Motif géométrique répétitif animé (Track B, session B5).
 *
 * Consolide 4 CodePen en un seul composant paramétré par `pattern` (rule of three dépassée —
 * 4 techniques très proches, un seul composant + un enum plutôt que 4 fichiers quasi-identiques) :
 * - `diamonds` (hexagoncircle) — losanges alternés, dégradés linéaires.
 * - `dots`      (Cancepto)      — points concentriques colorés.
 * - `angled`    (t_afif)        — bandes/losanges obliques via conic + linear-gradient.
 * - `eyes`      (t_afif)        — grille de disques concentriques avec un jitter de position.
 *
 * CSS pur (`background-image` en dégradés) + Web Animations API pour l'animation de
 * `backgroundPositionX`/`filter` — pas de `@keyframes` global à injecter dans `<head>`, cohérent
 * avec `MatrixGridBackground.js`.
 *
 * @param {{
 *   pattern?: 'diamonds' | 'dots' | 'angled' | 'eyes',
 *   colorA?: string,  - première couleur du motif (défaut var(--color-gold))
 *   colorB?: string,  - seconde couleur / fond (défaut '#0b0b0c')
 *   size?: number,    - taille d'une cellule en px (défaut 100)
 *   speed?: number,   - vitesse de défilement, multiplicateur (défaut 1)
 *   opacity?: number, - opacité globale du motif, 0-1 (défaut 0.15 — reste un fond, pas un
 *     habillage plein cadre comme dans les CodePen source, qui sont des démos, pas des arrière-plans)
 * }} [options]
 * @returns {import('../types.js').ComponentInstance}
 */
export function GeometricPatternBackground(options = {}) {
  let pattern = options.pattern ?? 'diamonds';
  let colorA = options.colorA ?? 'var(--color-gold)';
  let colorB = options.colorB ?? '#0b0b0c';
  let size = options.size ?? 100;
  let speed = options.speed ?? 1;
  let opacity = options.opacity ?? 0.15;

  const el = document.createElement('div');
  el.style.cssText = `position:absolute;inset:0;pointer-events:none;opacity:${opacity};`;

  /** @type {Animation | null} */
  let animation = null;

  function build() {
    animation?.cancel();
    const style = patternStyle(pattern, colorA, colorB, size);
    el.style.backgroundImage = style.backgroundImage;
    el.style.backgroundSize = style.backgroundSize;
    el.style.backgroundPosition = style.backgroundPosition ?? '0 0';
    el.style.backgroundColor = style.backgroundColor;
    el.style.filter = '';

    const duration = Math.max(300, 4000 / speed);
    if (pattern === 'dots') {
      animation = el.animate(
        [{ filter: 'hue-rotate(0deg)' }, { filter: 'hue-rotate(360deg)' }],
        { duration: duration * 3, iterations: Infinity, easing: 'linear' },
      );
    } else {
      const easing = pattern === 'eyes' ? 'cubic-bezier(.36,2,.64,-1)' : 'linear';
      animation = el.animate(
        [{ backgroundPositionX: '0px' }, { backgroundPositionX: `${size}px` }],
        { duration, iterations: Infinity, easing },
      );
    }
  }

  build();

  return {
    el,
    /** @param {unknown} newOptions */
    update(newOptions) {
      const o = /** @type {Record<string, unknown>} */ (newOptions ?? {});
      let changed = false;
      if (typeof o.pattern === 'string' && o.pattern !== pattern) { pattern = /** @type {*} */ (o.pattern); changed = true; }
      if (typeof o.colorA === 'string' && o.colorA !== colorA) { colorA = o.colorA; changed = true; }
      if (typeof o.colorB === 'string' && o.colorB !== colorB) { colorB = o.colorB; changed = true; }
      if (typeof o.size === 'number' && o.size !== size) { size = o.size; changed = true; }
      if (typeof o.speed === 'number' && o.speed !== speed) { speed = o.speed; changed = true; }
      if (typeof o.opacity === 'number' && o.opacity !== opacity) { opacity = o.opacity; el.style.opacity = String(opacity); }
      if (changed) build();
    },
    destroy() {
      animation?.cancel();
    },
  };
}

/**
 * Construit le `background-image`/`background-size` CSS pour un `pattern` donné. Pure — testable
 * indépendamment du DOM.
 * @param {'diamonds' | 'dots' | 'angled' | 'eyes'} pattern
 * @param {string} colorA
 * @param {string} colorB
 * @param {number} size
 * @returns {{ backgroundImage: string, backgroundSize: string, backgroundPosition?: string, backgroundColor: string }}
 */
export function patternStyle(pattern, colorA, colorB, size) {
  switch (pattern) {
    case 'dots':
      return {
        backgroundImage: `radial-gradient(${colorA} 31%, transparent 32%), radial-gradient(${colorB} 15%, transparent 16%)`,
        backgroundSize: `${size}px ${size}px`,
        backgroundColor: colorB,
      };
    case 'angled':
      return {
        backgroundImage: `conic-gradient(from -150deg at ${size * 0.1}px 50%, ${colorA} 120deg, transparent 0), repeating-linear-gradient(${colorA} 0 ${size * 0.1}px, transparent 0 50%)`,
        backgroundSize: `${size}px ${size * 3}px`,
        backgroundColor: colorB,
      };
    case 'eyes':
      return {
        backgroundImage: `radial-gradient(${colorA} 31%, transparent 32%), radial-gradient(${colorB} 15%, transparent 16%)`,
        backgroundSize: `${size}px ${size}px, ${size}px ${size}px`,
        backgroundPosition: `0 0, ${size / 2}px ${size / 2}px`,
        backgroundColor: colorB,
      };
    case 'diamonds':
    default:
      return {
        backgroundImage: `linear-gradient(45deg, ${colorA} 25%, transparent 25%), linear-gradient(-45deg, ${colorA} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${colorB} 75%), linear-gradient(-45deg, transparent 75%, ${colorB} 75%)`,
        backgroundSize: `${size}px ${size}px`,
        backgroundColor: colorB,
      };
  }
}
