// @ts-check
import { MAX_SCALE, MIN_SCALE, STAGE_HEIGHT, STAGE_WIDTH, fitStage, nextZoomStep, panView, resolveView, setViewScale, zoomView } from './view-transform.js';
/**
 * Cadre d'aperçu : le fond est rendu dans un conteneur de la taille réelle de la source OBS
 * (`render-reference.js`) puis mis à l'échelle pour remplir la zone libre, que l'écran soit plus petit
 * ou plus grand que la source. Les effets et le branding calculent
 * ainsi leurs tailles comme dans OBS ; seule la composition finale est réduite.
 *
 * La vue peut aussi être zoomée et déplacée (`dev/view-transform.js`) : tant qu'elle est « ajustée », elle suit la
 * zone ; dès que l'utilisateur zoome ou déplace, l'échelle et la position sont les siennes.
 */

export { STAGE_HEIGHT, STAGE_WIDTH, fitStage };

/**
 * Place le cadre dans `container` et le remet à l'échelle quand celui-ci change de taille.
 * @param {{ layer: HTMLElement, container: HTMLElement, windowRef: Window & typeof globalThis }} input
 */
export function createPreviewStage({ layer, container, windowRef }) {
  layer.style.width = `${STAGE_WIDTH}px`;
  layer.style.height = `${STAGE_HEIGHT}px`;
  layer.style.transformOrigin = '0 0';

  /** @type {import('./view-transform.js').View} */
  let view = { mode: 'fit' };
  /** @type {Set<(transform: import('./view-transform.js').Transform) => void>} */
  const listeners = new Set();

  const area = () => ({ areaWidth: container.clientWidth, areaHeight: container.clientHeight });
  const transform = () => resolveView(area(), view);

  function refresh() {
    const { scale, left, top } = transform();
    layer.style.left = `${left}px`;
    layer.style.top = `${top}px`;
    layer.style.transform = `scale(${scale})`;
    for (const listener of listeners) listener({ scale, left, top });
  }

  /** @param {import('./view-transform.js').View} next */
  function setView(next) {
    view = next;
    refresh();
  }

  const observer = new windowRef.ResizeObserver(refresh);
  observer.observe(container);
  refresh();
  return {
    refresh,
    /** L'échelle et la position actuelles du cadre dans la zone. */
    transform,
    /** @param {(transform: import('./view-transform.js').Transform) => void} listener @returns {() => void} */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Remplit la zone et la suit : l'état de départ. */
    fit() { setView({ mode: 'fit' }); },
    /** Zoome autour d'un point de la zone. @param {number} factor @param {{ x: number, y: number }} anchor */
    zoomAt(factor, anchor) { setView(zoomView(transform(), factor, anchor, area())); },
    /** Fixe l'échelle (1 = 100 %) en gardant le centre de la zone. @param {number} scale */
    setScale(scale) { setView(setViewScale(transform(), scale, area())); },
    /** Palier suivant (1) ou précédent (-1), autour du centre. @param {1 | -1} direction */
    stepZoom(direction) { setView(setViewScale(transform(), nextZoomStep(transform().scale, direction), area())); },
    /** @param {number} dx @param {number} dy */
    panBy(dx, dy) { setView(panView(transform(), dx, dy, area())); },
    isFit: () => view.mode === 'fit',
    limits: { min: MIN_SCALE, max: MAX_SCALE },
    destroy: () => observer.disconnect(),
  };
}
