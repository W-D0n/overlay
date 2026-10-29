// @ts-check
import { getRenderClock } from '../render-clock.js';
import { referenceScale } from '../render-reference.js';

/**
 * components/canvas-layer.js — Squelette commun des effets de fond dessinés sur un canvas.
 *
 * Un effet fournit seulement son état et `draw(ctx, frame, size)` ; ce module garde le canvas, le
 * `ResizeObserver`, le ratio de pixels, l'abonnement à l'horloge unique (`render-clock.js`) et la
 * destruction. La première frame d'une couche a toujours `dt = 0`. `setAudioLevel` et `trigger`
 * n'existent sur l'instance que si la couche les définit : le montage détecte ces capacités par leur
 * présence. Le repère de dessin est celui de la résolution de référence (`render-reference.js`) : la
 * taille passée à l'effet est « logique » et le contexte est mis à l'échelle de la source réelle, de sorte
 * que les tailles en pixels d'un effet (réglages comme constantes) suivent la résolution de la source.
 * `destroy` libère ce que la couche détient hors du canvas (minuteurs) ; `extend` ajoute des
 * méthodes propres à l'effet sur l'instance (ex. `morphTo`).
 *
 * @typedef {{ width: number, height: number }} LayerSize
 * @typedef {import('../render-clock.js').RenderFrame} RenderFrame
 * @typedef {{
 *   resize: (size: LayerSize, pixelRatio: number) => void,
 *   draw: (ctx: CanvasRenderingContext2D, frame: RenderFrame, size: LayerSize) => void,
 *   update?: (options: unknown) => void,
 *   setAudioLevel?: (levels: import('../audio-levels.js').AudioLevels) => void,
 *   trigger?: (event: any) => void,
 *   destroy?: () => void,
 *   extend?: Record<string, (...args: any[]) => any>,
 * }} CanvasLayer
 * @typedef {{
 *   clock?: Pick<ReturnType<typeof import('../render-clock.js').createRenderClock>, 'subscribe' | 'pixelRatio'>,
 *   documentRef?: Document,
 *   ResizeObserverImpl?: typeof ResizeObserver,
 * }} CanvasLayerEnvironment
 */

/**
 * @template {Record<string, any>} [Options=Record<string, any>]
 * @param {(options: Options, host: { documentRef: Document }) => CanvasLayer} create
 * @returns {(options?: Options, environment?: CanvasLayerEnvironment) => import('../types.js').ComponentInstance}
 */
export function defineCanvasLayer(create) {
  return (options = /** @type {Options} */ ({}), environment = {}) => {
    const clock = environment.clock ?? getRenderClock();
    const documentRef = environment.documentRef ?? document;
    const ResizeObserverImpl = environment.ResizeObserverImpl ?? ResizeObserver;

    const layer = create(options, { documentRef });
    const canvas = documentRef.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

    /** @type {LayerSize} */
    let size = { width: 0, height: 0 };
    let surface = { width: 0, height: 0 };
    let ratio = 0;
    let firstFrame = true;

    /**
     * Ajuste le canvas à son conteneur ; ne rappelle `resize` que si la taille ou le ratio a changé.
     * @param {number} pixelRatio
     * @returns {boolean} faux tant que le conteneur n'a pas de taille
     */
    function fit(pixelRatio) {
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      if (width === 0 || height === 0) return false;
      if (width === surface.width && height === surface.height && pixelRatio === ratio) return true;
      surface = { width, height };
      ratio = pixelRatio;
      const scale = referenceScale(height);
      size = { width: width / scale, height: height / scale };
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      ctx.scale(pixelRatio * scale, pixelRatio * scale);
      layer.resize(size, pixelRatio);
      return true;
    }

    const observer = new ResizeObserverImpl(() => { fit(clock.pixelRatio()); });
    observer.observe(canvas);

    const stop = clock.subscribe((frame) => {
      if (!fit(frame.pixelRatio)) return;
      const current = firstFrame ? { ...frame, dt: 0 } : frame;
      firstFrame = false;
      ctx.clearRect(0, 0, size.width, size.height);
      layer.draw(ctx, current, size);
    });

    /** @type {import('../types.js').ComponentInstance} */
    const instance = {
      el: canvas,
      update(newOptions) {
        layer.update?.(newOptions);
      },
      destroy() {
        stop();
        observer.disconnect();
        layer.destroy?.();
      },
    };
    if (layer.extend !== undefined) Object.assign(instance, layer.extend);
    if (layer.setAudioLevel !== undefined) {
      instance.setAudioLevel = (levels) => layer.setAudioLevel?.(levels);
    }
    if (layer.trigger !== undefined) {
      instance.trigger = (event) => layer.trigger?.(event);
    }
    return instance;
  };
}
