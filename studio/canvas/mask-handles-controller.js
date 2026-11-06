// @ts-check
/**
 * studio/canvas/mask-handles-controller.js — Editing the mask of a layer directly on the preview. A toggle in the "Masque" section ("Éditer sur l'aperçu") shows, over the selected layer, the
 * box of its rectangle or ellipse mask (drag it to move, drag a handle to resize) or the two stops of its linear fade (drag a line along the gradient). The arithmetic is in
 * `mask-geometry.js`; every gesture is a command of the editor (one history step per continuous gesture). The mask is drawn in the frame of the layer's calque: the layer's own
 * placement, or the whole canvas for a group, and turned with the layer, so the handles sit on what the mask really cuts.
 */
import { RENDER_REFERENCE } from '../../src/render/render-reference.js';
import { isGroup } from '../../src/layers/layer-group.js';
import { setMask } from '../../src/layers/layer-mask.js';
import { HANDLES, HANDLE_CURSORS, handlePoints, toPixelRect } from './canvas-geometry.js';
import { gradientLine, moveBox, moveStop, resizeBox } from './mask-geometry.js';
import { sourceToScreen } from './view-transform.js';

/**
 * @typedef {import('./canvas-geometry.js').Handle} Handle
 * @param {{
 *   overlay: HTMLElement,
 *   toggleHost: HTMLElement,
 *   stage: ReturnType<typeof import('./preview-stage.js').createPreviewStage>,
 *   studio: ReturnType<typeof import('../editor/studio-document.js').createStudioDocument>,
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   documentRef?: Document,
 * }} input
 */
export function createMaskHandlesController(input) {
  const documentRef = input.documentRef ?? document;
  const { overlay, stage, studio } = input;
  const { editor } = studio;

  let editing = false;
  let gestureCount = 0;

  /** @param {string} className @returns {HTMLElement} */
  const make = (className) => {
    const el = documentRef.createElement('div');
    el.className = className;
    return el;
  };

  const toggle = documentRef.createElement('button');
  toggle.type = 'button';
  toggle.className = 'layers-add';
  toggle.id = 'mask-edit-on-canvas';
  toggle.textContent = 'Éditer sur l’aperçu';
  toggle.setAttribute('aria-pressed', 'false');
  toggle.title = 'Montre le masque sur l’aperçu : glissez la boîte, ses poignées ou les lignes du fondu';
  input.toggleHost.appendChild(toggle);
  toggle.addEventListener('click', () => {
    editing = !editing;
    render();
  });

  const frameEl = make('co-mask');
  frameEl.hidden = true;
  overlay.appendChild(frameEl);

  /** @returns {import('../../src/scene/scene-doc.js').Layer | undefined} the selected layer when it is alone and has a mask */
  function maskedLayer() {
    const { selection } = editor.state();
    if (selection.length !== 1) return undefined;
    const layer = studio.state().scene.layers.find((candidate) => candidate.id === selection[0]);
    return layer?.mask === undefined ? undefined : layer;
  }

  /** @param {import('../../src/scene/scene-doc.js').Layer} layer the frame the mask is drawn in, in pixels of the source */
  function frameOf(layer) {
    return isGroup(layer) ? { x: 0, y: 0, width: RENDER_REFERENCE.width, height: RENDER_REFERENCE.height } : toPixelRect(layer.placement);
  }

  /** @param {number} dx @param {number} dy @param {number} degrees @returns {{ dx: number, dy: number }} a screen movement turned back by the rotation of the layer */
  function unrotate(dx, dy, degrees) {
    const radians = (-degrees * Math.PI) / 180;
    return { dx: dx * Math.cos(radians) - dy * Math.sin(radians), dy: dx * Math.sin(radians) + dy * Math.cos(radians) };
  }

  /**
   * Starts a drag: the pointer is captured by the handle, every move is turned into fractions of the frame and handed to `apply`.
   * @param {HTMLElement} el
   * @param {(dx: number, dy: number, width: number, height: number, start: import('../../src/layers/layer-mask.js').Mask) => Partial<import('../../src/layers/layer-mask.js').Mask>} apply
   */
  function draggable(el, apply) {
    el.addEventListener('pointerdown', (event) => {
      const layer = maskedLayer();
      if (layer === undefined || layer.mask === undefined || event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      const id = layer.id;
      const start = layer.mask;
      const degrees = layer.rotation ?? 0;
      const frame = frameOf(layer);
      const scale = stage.transform().scale;
      const width = frame.width * scale;
      const height = frame.height * scale;
      const from = { x: event.clientX, y: event.clientY };
      const key = `mask-gesture:${id}:${gestureCount += 1}`;
      el.setPointerCapture?.(event.pointerId);
      /** @param {PointerEvent} move */
      const onMove = (move) => {
        const turned = unrotate(move.clientX - from.x, move.clientY - from.y, degrees);
        const result = editor.setLayers([id], { mask: setMask(start, apply(turned.dx, turned.dy, width, height, start)) }, { coalesceKey: key });
        if (!result.ok && result.message !== undefined) input.report.error(result.message);
      };
      const onUp = () => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        el.releasePointerCapture?.(event.pointerId);
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    });
  }

  // The box: a body to move it, eight handles to resize it.
  const boxEl = make('co-mask-box');
  boxEl.dataset.part = 'box';
  draggable(boxEl, (dx, dy, width, height, start) => (start.shape === 'linear' ? {} : moveBox(start, dx / width, dy / height)));
  const handleEls = /** @type {Record<Handle, HTMLElement>} */ (/** @type {unknown} */ (Object.fromEntries(HANDLES.map((handle) => {
    const el = make('co-mask-handle');
    el.dataset.part = `handle-${handle}`;
    el.style.cursor = HANDLE_CURSORS[handle];
    draggable(el, (dx, dy, width, height, start) => (start.shape === 'linear' ? {} : resizeBox(start, handle, dx / width, dy / height)));
    boxEl.appendChild(el);
    return [handle, el];
  }))));
  // The fade: one line per stop, dragged along the gradient.
  const stopEls = /** @type {Record<'start' | 'end', HTMLElement>} */ ({ start: make('co-mask-stop'), end: make('co-mask-stop') });
  for (const which of /** @type {const} */ (['start', 'end'])) {
    stopEls[which].dataset.part = `stop-${which}`;
    stopEls[which].classList.add(`is-${which}`);
    draggable(stopEls[which], (dx, dy, width, height, start) => (start.shape === 'linear' ? moveStop(start, which, dx, dy, width, height) : {}));
  }
  frameEl.append(boxEl, stopEls.start, stopEls.end);

  /** @param {HTMLElement} el @param {number} left @param {number} top @param {number} width @param {number} height */
  function place(el, left, top, width, height) {
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
  }

  function render() {
    const layer = maskedLayer();
    toggle.hidden = layer === undefined;
    toggle.setAttribute('aria-pressed', String(editing));
    frameEl.hidden = !editing || layer === undefined;
    if (!editing || layer === undefined || layer.mask === undefined) return;
    const { mask } = layer;
    const frame = frameOf(layer);
    const t = stage.transform();
    const origin = sourceToScreen(t, { x: frame.x, y: frame.y });
    const width = frame.width * t.scale;
    const height = frame.height * t.scale;
    place(frameEl, origin.x, origin.y, width, height);
    // The mask turns with the layer: a layer around its center, a group around the center of its members.
    const pivot = toPixelRect(layer.placement);
    const pivotX = ((pivot.x + pivot.width / 2 - frame.x) / frame.width) * width;
    const pivotY = ((pivot.y + pivot.height / 2 - frame.y) / frame.height) * height;
    frameEl.style.transformOrigin = `${pivotX}px ${pivotY}px`;
    frameEl.style.transform = layer.rotation === undefined ? '' : `rotate(${layer.rotation}deg)`;

    const linear = mask.shape === 'linear';
    boxEl.hidden = linear;
    stopEls.start.hidden = !linear;
    stopEls.end.hidden = !linear;
    if (!linear) {
      place(boxEl, mask.x * width, mask.y * height, mask.width * width, mask.height * height);
      const points = handlePoints({ x: 0, y: 0, width: mask.width * width, height: mask.height * height });
      for (const handle of HANDLES) {
        handleEls[handle].style.left = `${points[handle].x}px`;
        handleEls[handle].style.top = `${points[handle].y}px`;
      }
      return;
    }
    // Each stop is a line across the frame, perpendicular to the gradient, at its place along the gradient line.
    const line = gradientLine(mask.angle, width, height);
    const reach = Math.hypot(width, height);
    for (const which of /** @type {const} */ (['start', 'end'])) {
      const along = (mask[which] - 0.5) * line.length;
      const cx = width / 2 + line.dx * along;
      const cy = height / 2 + line.dy * along;
      const el = stopEls[which];
      place(el, cx - reach / 2, cy - 5, reach, 10);
      el.style.transform = `rotate(${(Math.atan2(line.dy, line.dx) * 180) / Math.PI + 90}deg)`;
    }
  }

  const unsubscribeStage = stage.subscribe(render);
  const unsubscribeDocument = studio.subscribe(render);
  render();

  return {
    render,
    isEditing: () => editing,
    destroy() {
      unsubscribeStage();
      unsubscribeDocument();
      frameEl.remove();
      toggle.remove();
    },
  };
}
