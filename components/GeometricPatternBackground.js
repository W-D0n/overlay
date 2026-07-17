// @ts-check
/**
 * GeometricPatternBackground.js — Motif géométrique répétitif animé (Track B, session B5).
 *
 * Consolide 4 CodePen en un seul composant paramétré par `pattern` (rule of three dépassée —
 * 4 techniques très proches, un seul composant + un enum plutôt que 4 fichiers quasi-identiques) :
 * - `diamonds` (hexagoncircle) — losanges alternés, dégradés linéaires.
 * - `dots`      (Cancepto)      — points concentriques colorés.
 * - `chevrons`  (t_afif)        — zigzags orientables formés de deux dégradés diagonaux.
 * - `eyes`      (t_afif)        — grille de disques concentriques avec un jitter de position.
 *
 * CSS pur (`background-image` en dégradés) + Web Animations API pour l'animation de
 * `backgroundPositionX`/`filter` — pas de `@keyframes` global à injecter dans `<head>`, cohérent
 * avec `MatrixGridBackground.js`.
 *
 * @param {{
 *   pattern?: 'diamonds' | 'dots' | 'chevrons' | 'eyes',
 *   colorA?: string,  - première couleur du motif (défaut var(--color-gold))
 *   colorB?: string,  - seconde couleur / fond (défaut '#0b0b0c')
 *   size?: number,    - taille d'une cellule en px (défaut 100)
 *   speed?: number,   - vitesse de défilement, multiplicateur (défaut 1)
 *   direction?: 'left' | 'right' | 'up' | 'down', - direction du mouvement (défaut 'right')
 *   angle?: number,   - orientation des lignes en degrés (défaut 45)
 *   opacity?: number, - opacité globale du motif, 0-1 (défaut 0.15 — reste un fond, pas un
 *     habillage plein cadre comme dans les CodePen source, qui sont des démos, pas des arrière-plans)
 * }} [options]
 * @returns {import('../types.js').ComponentInstance}
 */
export function GeometricPatternBackground(options = {}) {
  let pattern = normalizePattern(options.pattern);
  let colorA = options.colorA ?? 'var(--color-gold)';
  let colorB = options.colorB ?? '#0b0b0c';
  let size = options.size ?? 100;
  let speed = options.speed ?? 1;
  let direction = isDirection(options.direction) ? options.direction : 'right';
  let angle = options.angle ?? 45;
  let opacity = options.opacity ?? 0.15;

  const el = document.createElement('div');
  el.style.cssText = `position:absolute;inset:0;pointer-events:none;opacity:${opacity};`;

  /** @type {Animation | null} */
  let animation = null;

  function build() {
    animation?.cancel();
    const style = patternStyle(pattern, colorA, colorB, size, angle);
    el.style.backgroundImage = style.backgroundImage;
    el.style.backgroundSize = style.backgroundSize;
    el.style.backgroundPosition = style.backgroundPosition ?? '0 0';
    el.style.backgroundColor = style.backgroundColor;
    el.style.filter = '';

    const duration = Math.max(300, 4000 / Math.max(0.01, Math.abs(speed)));
    const easing = pattern === 'eyes' ? 'cubic-bezier(.36,2,.64,-1)' : 'linear';
    animation = el.animate(
      movementKeyframes(direction, size, pattern === 'dots'),
      { duration: pattern === 'dots' ? duration * 3 : duration, iterations: Infinity, easing },
    );
  }

  build();

  return {
    el,
    /** @param {unknown} newOptions */
    update(newOptions) {
      const o = /** @type {Record<string, unknown>} */ (newOptions ?? {});
      let changed = false;
      if (typeof o.pattern === 'string') {
        const nextPattern = normalizePattern(o.pattern);
        if (nextPattern !== pattern) { pattern = nextPattern; changed = true; }
      }
      if (typeof o.colorA === 'string' && o.colorA !== colorA) { colorA = o.colorA; changed = true; }
      if (typeof o.colorB === 'string' && o.colorB !== colorB) { colorB = o.colorB; changed = true; }
      if (typeof o.size === 'number' && o.size !== size) { size = o.size; changed = true; }
      if (typeof o.speed === 'number' && o.speed !== speed) { speed = o.speed; changed = true; }
      if (isDirection(o.direction) && o.direction !== direction) { direction = o.direction; changed = true; }
      if (typeof o.angle === 'number' && o.angle !== angle) { angle = o.angle; changed = true; }
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
 * @param {'diamonds' | 'dots' | 'chevrons' | 'eyes'} pattern
 * @param {string} colorA
 * @param {string} colorB
 * @param {number} size
 * @param {number} [angle]
 * @returns {{ backgroundImage: string, backgroundSize: string, backgroundPosition?: string, backgroundColor: string }}
 */
export function patternStyle(pattern, colorA, colorB, size, angle = 45) {
  switch (pattern) {
    case 'dots':
      return {
        backgroundImage: `radial-gradient(${colorA} 31%, transparent 32%), radial-gradient(${colorB} 15%, transparent 16%)`,
        backgroundSize: `${size}px ${size}px`,
        backgroundColor: colorB,
      };
    case 'chevrons':
      return {
        backgroundImage: `linear-gradient(${angle}deg, transparent 42%, ${colorA} 43% 55%, transparent 56%), linear-gradient(${-angle}deg, transparent 42%, ${colorA} 43% 55%, transparent 56%)`,
        backgroundSize: `${size}px ${size / 2}px`,
        backgroundPosition: `0 0, ${size / 2}px ${size / 4}px`,
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
        backgroundImage: `linear-gradient(${angle}deg, ${colorA} 25%, transparent 25%), linear-gradient(${-angle}deg, ${colorA} 25%, transparent 25%), linear-gradient(${angle}deg, transparent 75%, ${colorB} 75%), linear-gradient(${-angle}deg, transparent 75%, ${colorB} 75%)`,
        backgroundSize: `${size}px ${size}px`,
        backgroundColor: colorB,
      };
  }
}

const PATTERNS = /** @type {const} */ (['diamonds', 'dots', 'chevrons', 'eyes']);
const DIRECTIONS = /** @type {const} */ (['left', 'right', 'up', 'down']);

/** `angled` reste accepté pour relire les anciens presets, mais n'est plus proposé dans le tuner. */
function normalizePattern(value) {
  if (value === 'angled') return 'chevrons';
  return typeof value === 'string' && /** @type {readonly string[]} */ (PATTERNS).includes(value)
    ? /** @type {typeof PATTERNS[number]} */ (value)
    : 'diamonds';
}

/** @param {unknown} value @returns {value is typeof DIRECTIONS[number]} */
function isDirection(value) {
  return typeof value === 'string' && /** @type {readonly string[]} */ (DIRECTIONS).includes(value);
}

/**
 * Keyframes de défilement pures : la direction est désormais un paramètre réel, y compris pour les
 * points (qui conservent en plus leur rotation de teinte).
 * @param {typeof DIRECTIONS[number]} direction
 * @param {number} distance
 * @param {boolean} withHue
 * @returns {Keyframe[]}
 */
export function movementKeyframes(direction, distance, withHue = false) {
  const horizontal = direction === 'left' || direction === 'right';
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  const property = horizontal ? 'backgroundPositionX' : 'backgroundPositionY';
  const from = { [property]: '0px' };
  const to = { [property]: `${sign * distance}px` };
  if (withHue) {
    from.filter = 'hue-rotate(0deg)';
    to.filter = 'hue-rotate(360deg)';
  }
  return [from, to];
}
