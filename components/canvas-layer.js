// @ts-check
import { getRenderClock } from '../render-clock.js';
import { referenceScale } from '../render-reference.js';
import { smooth } from '../layer-cost.js';

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
 * Par défaut, l'échelle est celle de la **hauteur de la couche** : un effet dessine sa composition de référence dans son calque, un calque
 * plus petit en montre une version réduite. Une couche de **contenu** (`sceneScaled: true` : texte, forme, image) dessine à l'échelle de la
 * **scène** (`environment.sceneHeight`, fournie par le moteur) : sa zone est une fenêtre, pas une réduction, et 96 px de texte font 96 px
 * de la source de référence quelle que soit la taille de la couche.
 *
 * Une couche **statique** (`animated: false` : texte, forme, image) ne dessine que lorsqu'elle est invalidée — à la création, à
 * chaque changement de taille ou de ratio, et quand elle appelle `host.invalidate()` après une mise à jour : huit couches de
 * contenu ne coûtent alors aucun dessin par image.
 *
 * @typedef {{ width: number, height: number }} LayerSize
 * @typedef {import('../render-clock.js').RenderFrame} RenderFrame
 * @typedef {{
 *   animated?: boolean,
 *   sceneScaled?: boolean,
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
 *   now?: () => number,
 *   sceneHeight?: () => number,
 * }} CanvasLayerEnvironment
 */

/**
 * @template {Record<string, any>} [Options=Record<string, any>]
 * @param {(options: Options, host: { documentRef: Document, invalidate: () => void }) => CanvasLayer} create
 * @returns {(options?: Options, environment?: CanvasLayerEnvironment) => import('../types.js').ComponentInstance}
 */
export function defineCanvasLayer(create) {
  return (options = /** @type {Options} */ ({}), environment = {}) => {
    const clock = environment.clock ?? getRenderClock();
    const documentRef = environment.documentRef ?? document;
    const ResizeObserverImpl = environment.ResizeObserverImpl ?? ResizeObserver;

    /** Vrai tant que le canvas n'a pas été redessiné depuis un changement ; sert aux couches statiques. */
    let dirty = true;
    const layer = create(options, { documentRef, invalidate: () => { dirty = true; } });
    const canvas = documentRef.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

    /** @type {LayerSize} */
    let size = { width: 0, height: 0 };
    let surface = { width: 0, height: 0 };
    let ratio = 0;
    let firstFrame = true;
    const now = environment.now ?? (() => performance.now());
    /** Temps de `draw` par image, lissé (`layer-cost.js`) ; `null` tant qu'aucune image n'est dessinée. @type {number | null} */
    let cost = null;

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
      const scene = layer.sceneScaled === true ? environment.sceneHeight?.() : undefined;
      const scale = referenceScale(scene !== undefined && scene > 0 ? scene : height);
      size = { width: width / scale, height: height / scale };
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      ctx.scale(pixelRatio * scale, pixelRatio * scale);
      dirty = true;
      layer.resize(size, pixelRatio);
      return true;
    }

    const observer = new ResizeObserverImpl(() => { fit(clock.pixelRatio()); });
    observer.observe(canvas);

    const stop = clock.subscribe((frame) => {
      if (!fit(frame.pixelRatio)) return;
      if (layer.animated === false && !dirty) return;
      dirty = false;
      const current = firstFrame ? { ...frame, dt: 0 } : frame;
      firstFrame = false;
      ctx.clearRect(0, 0, size.width, size.height);
      const started = now();
      layer.draw(ctx, current, size);
      cost = smooth(cost, now() - started);
    });

    /** @type {import('../types.js').ComponentInstance} */
    const instance = {
      el: canvas,
      cost: () => cost,
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
