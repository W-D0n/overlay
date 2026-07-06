// @ts-check
/**
 * MatrixGridBackground.js — Grille 3D façon Matrix/Tron/Cyberpunk (Track B, session B3).
 *
 * Inspiration technique : CodePen wheatup (Matrix Grid Background) — deux plans en perspective
 * défilant vers l'horizon. Portage CSS + Web Animations API : chaque instance anime ses propres
 * éléments (pas de `@keyframes` globale injectée dans `<head>` — rien à nettoyer au-delà de
 * `Animation.cancel()`, cohérent avec le cycle de vie `destroy()` des autres composants).
 *
 * @param {{
 *   color?: string,     - couleur de la grille (défaut '#00ff66', vert Matrix — cyan pour Tron)
 *   speed?: number,     - vitesse de défilement, multiplicateur (défaut 1)
 *   gridSize?: number,  - taille d'une cellule en px (défaut 100)
 * }} [options]
 * @returns {import('../types.js').ComponentInstance}
 */
export function MatrixGridBackground(options = {}) {
  let color = options.color ?? '#00ff66';
  let speed = options.speed ?? 1;
  let gridSize = options.gridSize ?? 100;

  const el = document.createElement('div');
  el.style.cssText = [
    'position:absolute', 'inset:0', 'overflow:hidden', 'pointer-events:none',
    'background:#000', 'perspective:100rem', 'transform-style:preserve-3d',
  ].join(';');

  const planeTop = document.createElement('div');
  const planeBottom = document.createElement('div');
  /** @type {[HTMLDivElement, 1 | -1][]} */
  const planes = [[planeTop, 1], [planeBottom, -1]];
  for (const [plane, flip] of planes) {
    plane.style.cssText = [
      'position:absolute', 'left:50%', 'width:300%', 'height:150%', 'min-height:70rem',
      'transform-style:preserve-3d',
      flip === 1 ? 'bottom:0' : 'top:0',
      `transform-origin:${flip === 1 ? 'bottom' : 'top'} center`,
      `transform:translateX(-50%) rotateX(${flip * 85}deg)`,
    ].join(';');
    el.appendChild(plane);
  }

  /** @type {Animation[]} */
  let animations = [];

  function buildGrids() {
    animations.forEach((a) => a.cancel());
    animations = [];
    for (const [plane, flip] of planes) {
      plane.innerHTML = '';
      const grid = document.createElement('div');
      grid.style.cssText = [
        'position:absolute', 'inset:0', `color:${color}`,
        `background-image:repeating-linear-gradient(to left, currentColor, currentColor 3px, transparent 3px, transparent ${gridSize}px),repeating-linear-gradient(to bottom, currentColor, currentColor 3px, transparent 3px, transparent ${gridSize}px)`,
        'filter:drop-shadow(0 0 4px currentColor)',
      ].join(';');
      plane.appendChild(grid);
      const duration = Math.max(200, 3000 / speed);
      animations.push(grid.animate(
        [{ transform: 'translateY(0px)' }, { transform: `translateY(${gridSize * flip}px)` }],
        { duration, iterations: Infinity, easing: 'linear' },
      ));
    }
  }

  buildGrids();

  return {
    el,
    /** @param {unknown} newOptions */
    update(newOptions) {
      const o = /** @type {Record<string, unknown>} */ (newOptions ?? {});
      let changed = false;
      if (typeof o.color === 'string' && o.color !== color) { color = o.color; changed = true; }
      if (typeof o.gridSize === 'number' && o.gridSize !== gridSize) { gridSize = o.gridSize; changed = true; }
      if (typeof o.speed === 'number' && o.speed !== speed) { speed = o.speed; changed = true; }
      if (changed) buildGrids();
    },
    destroy() {
      animations.forEach((a) => a.cancel());
    },
  };
}
