// @ts-check
/**
 * Cadre d'aperçu 16:9 : le fond est rendu dans un conteneur de la taille réelle de la source OBS
 * (1920×1080) puis mis à l'échelle pour tenir dans la zone libre. Les effets et le branding calculent
 * ainsi leurs tailles comme dans OBS ; seule la composition finale est réduite.
 */

export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;
const STAGE_MARGIN = 16;

/**
 * Échelle et position du cadre dans la zone libre, centré, sans jamais l'agrandir au-delà de 1.
 * @param {{ areaWidth: number, areaHeight: number, insetLeft?: number }} input
 * @returns {{ scale: number, left: number, top: number }}
 */
export function fitStage({ areaWidth, areaHeight, insetLeft = 0 }) {
  const freeWidth = Math.max(0, areaWidth - insetLeft - 2 * STAGE_MARGIN);
  const freeHeight = Math.max(0, areaHeight - 2 * STAGE_MARGIN);
  const scale = Math.min(1, freeWidth / STAGE_WIDTH, freeHeight / STAGE_HEIGHT);
  return {
    scale,
    left: insetLeft + (areaWidth - insetLeft - STAGE_WIDTH * scale) / 2,
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
