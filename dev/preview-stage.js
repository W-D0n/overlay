// @ts-check
import { RENDER_REFERENCE } from '../render-reference.js';
/**
 * Cadre d'aperçu : le fond est rendu dans un conteneur de la taille réelle de la source OBS
 * (`render-reference.js`) puis mis à l'échelle pour remplir la zone libre, que l'écran soit plus petit
 * ou plus grand que la source. Les effets et le branding calculent
 * ainsi leurs tailles comme dans OBS ; seule la composition finale est réduite.
 */

export const STAGE_WIDTH = RENDER_REFERENCE.width;
export const STAGE_HEIGHT = RENDER_REFERENCE.height;
const STAGE_MARGIN = 16;

/**
 * Échelle et position du cadre dans la zone libre, centré. L'échelle suit la zone sans plafond :
 * sur un grand écran l'aperçu est agrandi (même composition qu'OBS, simplement plus grande).
 * @param {{ areaWidth: number, areaHeight: number }} input
 * @returns {{ scale: number, left: number, top: number }}
 */
export function fitStage({ areaWidth, areaHeight }) {
  const freeWidth = Math.max(0, areaWidth - 2 * STAGE_MARGIN);
  const freeHeight = Math.max(0, areaHeight - 2 * STAGE_MARGIN);
  const scale = Math.min(freeWidth / STAGE_WIDTH, freeHeight / STAGE_HEIGHT);
  return {
    scale,
    left: (areaWidth - STAGE_WIDTH * scale) / 2,
    top: (areaHeight - STAGE_HEIGHT * scale) / 2,
  };
}

/**
 * Place le cadre dans `container` et le remet à l'échelle quand celui-ci change de taille.
 * @param {{ layer: HTMLElement, container: HTMLElement, windowRef: Window & typeof globalThis }} input
 * @returns {{ refresh(): void, destroy(): void }}
 */
export function createPreviewStage({ layer, container, windowRef }) {
  layer.style.width = `${STAGE_WIDTH}px`;
  layer.style.height = `${STAGE_HEIGHT}px`;
  layer.style.transformOrigin = '0 0';

  function refresh() {
    const { scale, left, top } = fitStage({
      areaWidth: container.clientWidth,
      areaHeight: container.clientHeight,
    });
    layer.style.left = `${left}px`;
    layer.style.top = `${top}px`;
    layer.style.transform = `scale(${scale})`;
  }

  const observer = new windowRef.ResizeObserver(refresh);
  observer.observe(container);
  refresh();
  return { refresh, destroy: () => observer.disconnect() };
}
