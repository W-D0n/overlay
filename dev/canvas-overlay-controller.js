// @ts-check
/**
 * dev/canvas-overlay-controller.js — La manipulation directe sur l'aperçu : sélectionner, déplacer, redimensionner, aimanter,
 * sélectionner au rectangle, naviguer (zoom, déplacement de la vue).
 *
 * La surcouche est un calque transparent posé sur la zone d'aperçu ; elle dessine la sélection (huit poignées), le survol, les
 * repères d'aimantation et le rectangle de sélection en pixels d'écran, d'après l'échelle de l'aperçu. Elle ne détient aucun
 * état de scène : chaque geste est une commande de l'éditeur (une seule entrée d'historique par geste continu) et la
 * géométrie vient de `canvas-geometry.js` et `canvas-snapping.js`.
 *
 * Souris : clic (sélectionne), Maj+clic (ajoute / retire), Alt+clic (la couche en dessous), glisser (déplace ; Maj : un seul
 * axe), poignées (Maj : proportions ; Alt : depuis le centre), glisser sur le vide (rectangle de sélection), Ctrl/Cmd tenu :
 * pas d'aimantation, Espace + glisser ou bouton du milieu (déplacer la vue), Ctrl + molette (zoom).
 * Clavier (surcouche active) : flèches (1 px, Maj 10 px), Suppr, Ctrl+D, Ctrl+A, Échap (annule le geste, ou désélectionne),
 * + / − (zoom), 0 (ajuster), 1 (100 %).
 * Une couche verrouillée se sélectionne mais ne se déplace ni ne se redimensionne.
 *
 * @typedef {import('./canvas-geometry.js').Rect} Rect
 * @typedef {import('./canvas-geometry.js').Handle} Handle
 */
import { RENDER_REFERENCE } from '../render-reference.js';
import {
  HANDLES, HANDLE_CURSORS, fromPixelRect, handlePoints, hitTestAll, isSelectableOnCanvas, marqueeHits, moveRect, rectBetween, resizeRect, scaleRectsWithin, toPixelRect, unionRect,
} from './canvas-geometry.js';
import { collectTargets, snapMove, snapResize } from './canvas-snapping.js';
import { screenToSource, sourceToScreen } from './view-transform.js';

/** Force de l'aimant, en pixels d'écran : la même à tout zoom. */
const SNAP_SCREEN_PX = 8;
/** Un geste plus court que ça est un clic. */
const CLICK_SLOP_PX = 3;

/**
 * @param {{
 *   area: HTMLElement,
 *   overlay: HTMLElement,
 *   stage: ReturnType<typeof import('./preview-stage.js').createPreviewStage>,
 *   studio: ReturnType<typeof import('./studio-document.js').createStudioDocument>,
 *   isIdentity: (kind: string) => boolean,
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   documentRef?: Document,
 *   windowRef?: Window,
 * }} input
 */
export function createCanvasOverlayController(input) {
  const documentRef = input.documentRef ?? document;
  const { area, overlay, stage, studio, isIdentity } = input;
  const { editor } = studio;

  /** Marge de sécurité proposée comme cible d'aimantation, en pixels de la source, ou `null`. */
  let safeMargin = /** @type {number | null} */ (null);
  let snapEnabled = true;
  let spaceDown = false;
  /** @type {string | null} */
  let hoverId = null;
  /**
   * @type {null | {
   *   type: 'move' | 'resize' | 'marquee' | 'pan',
   *   pointerId: number,
   *   startPoint: { x: number, y: number },
   *   startScreen: { x: number, y: number },
   *   startRects: Record<string, Rect>,
   *   startBox: Rect | null,
   *   handle: Handle | null,
   *   baseSelection: string[],
   *   changed: boolean,
   *   moved: boolean,
   *   last: { x: number, y: number },
   * }}
   */
  let gesture = null;

  // ── DOM de la surcouche ────────────────────────────────────────────────

  /** @param {string} className */
  const make = (className) => {
    const el = documentRef.createElement('div');
    el.className = className;
    return el;
  };
  const selectionBox = make('co-selection');
  const handleEls = /** @type {Record<Handle, HTMLElement>} */ (/** @type {unknown} */ (Object.fromEntries(HANDLES.map((handle) => {
    const el = make('co-handle');
    el.dataset.handle = handle;
    el.style.cursor = HANDLE_CURSORS[handle];
    selectionBox.appendChild(el);
    return [handle, el];
  }))));
  const readout = make('co-readout');
  const hoverBox = make('co-hover');
  const marqueeBox = make('co-marquee');
  const guidesLayer = make('co-guides');
  /** @type {Map<string, HTMLElement>} */
  const outlines = new Map();
  overlay.append(hoverBox, guidesLayer, selectionBox, marqueeBox, readout);
  overlay.tabIndex = 0;
  overlay.setAttribute('role', 'application');
  overlay.setAttribute('aria-label', 'Aperçu : manipuler les couches (flèches pour déplacer, Suppr pour supprimer)');

  // ── Lecture de l'état ───────────────────────────────────────────────────

  const layers = () => studio.state().scene.layers;
  const transform = () => stage.transform();
  const selection = () => editor.state().selection;

  /** @param {{ clientX: number, clientY: number }} event @returns {{ x: number, y: number }} le point dans la zone, en pixels d'écran */
  function areaPoint(event) {
    const rect = area.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  /** @param {{ clientX: number, clientY: number }} event */
  const sourcePoint = (event) => screenToSource(transform(), areaPoint(event));

  /** Les couches sélectionnées qu'un geste peut modifier : visibles et non verrouillées. */
  function movableSelected() {
    const chosen = selection();
    return layers().filter((layer) => chosen.includes(layer.id) && layer.visible && layer.locked !== true);
  }

  /** @param {Rect} rect @returns {Rect} le même rectangle, en pixels d'écran */
  function toScreen(rect) {
    const t = transform();
    const origin = sourceToScreen(t, { x: rect.x, y: rect.y });
    return { x: origin.x, y: origin.y, width: rect.width * t.scale, height: rect.height * t.scale };
  }

  /** @param {HTMLElement} el @param {Rect} rect */
  function place(el, rect) {
    el.style.left = `${rect.x}px`;
    el.style.top = `${rect.y}px`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
  }

  // ── Rendu ───────────────────────────────────────────────────────────────

  function render() {
    const chosen = selection();
    const selectedLayers = layers().filter((layer) => chosen.includes(layer.id) && layer.visible);
    const allUnlocked = selectedLayers.length > 0 && selectedLayers.every((layer) => layer.locked !== true);

    selectionBox.hidden = selectedLayers.length === 0;
    if (selectedLayers.length > 0) {
      const box = unionRect(selectedLayers.map((layer) => toPixelRect(layer.placement)));
      place(selectionBox, toScreen(box));
      selectionBox.classList.toggle('is-locked', !allUnlocked);
      const points = handlePoints({ x: 0, y: 0, width: toScreen(box).width, height: toScreen(box).height });
      for (const handle of HANDLES) {
        const el = handleEls[handle];
        el.hidden = !allUnlocked;
        el.style.left = `${points[handle].x}px`;
        el.style.top = `${points[handle].y}px`;
      }
    }

    // Contours individuels quand la sélection compte plusieurs couches.
    const wanted = new Set(selectedLayers.length > 1 ? selectedLayers.map((layer) => layer.id) : []);
    for (const [id, el] of outlines) {
      if (wanted.has(id)) continue;
      el.remove();
      outlines.delete(id);
    }
    for (const layer of selectedLayers) {
      if (!wanted.has(layer.id)) continue;
      let el = outlines.get(layer.id);
      if (el === undefined) {
        el = make('co-outline');
        outlines.set(layer.id, el);
        overlay.insertBefore(el, guidesLayer);
      }
      el.classList.toggle('is-locked', layer.locked === true);
      place(el, toScreen(toPixelRect(layer.placement)));
    }

    const hovered = hoverId === null || chosen.includes(hoverId) ? undefined : layers().find((layer) => layer.id === hoverId);
    hoverBox.hidden = hovered === undefined;
    if (hovered !== undefined) place(hoverBox, toScreen(toPixelRect(hovered.placement)));
  }

  /** @param {string | null} text */
  function showReadout(text) {
    readout.hidden = text === null;
    if (text === null) return;
    readout.textContent = text;
    const box = selectionBox.hidden ? null : { left: selectionBox.offsetLeft, top: selectionBox.offsetTop, width: selectionBox.offsetWidth, height: selectionBox.offsetHeight };
    if (box !== null) {
      readout.style.left = `${box.left + box.width / 2}px`;
      readout.style.top = `${box.top + box.height + 10}px`;
    }
  }

  /** @param {import('./canvas-snapping.js').Guide[]} guides */
  function showGuides(guides) {
    guidesLayer.replaceChildren();
    for (const guide of guides) {
      const el = make(`co-guide co-guide-${guide.kind}`);
      if (guide.axis === 'x') {
        const top = sourceToScreen(transform(), { x: guide.pos, y: guide.from });
        const bottom = sourceToScreen(transform(), { x: guide.pos, y: guide.to });
        el.style.left = `${top.x}px`;
        el.style.top = `${top.y}px`;
        el.style.width = '1px';
        el.style.height = `${bottom.y - top.y}px`;
      } else {
        const left = sourceToScreen(transform(), { x: guide.from, y: guide.pos });
        const right = sourceToScreen(transform(), { x: guide.to, y: guide.pos });
        el.style.left = `${left.x}px`;
        el.style.top = `${left.y}px`;
        el.style.width = `${right.x - left.x}px`;
        el.style.height = '1px';
      }
      guidesLayer.appendChild(el);
    }
  }

  // ── Aimantation ─────────────────────────────────────────────────────────

  /** @param {string[]} movingIds */
  function targetsFor(movingIds) {
    const others = layers().filter((layer) => !movingIds.includes(layer.id) && layer.visible).map((layer) => toPixelRect(layer.placement));
    return collectTargets({ canvas: { width: RENDER_REFERENCE.width, height: RENDER_REFERENCE.height }, others, margin: safeMargin });
  }
  const snapThreshold = () => SNAP_SCREEN_PX / transform().scale;

  // ── Gestes ──────────────────────────────────────────────────────────────

  /** @param {Record<string, Rect>} rects @param {string} label @param {string} key */
  function commit(rects, label, key) {
    const patches = Object.fromEntries(Object.entries(rects).map(([id, rect]) => [id, fromPixelRect(rect)]));
    const result = editor.setPlacements(patches, { coalesceKey: key, label });
    if (!result.ok) input.report.error(result.message);
    return result.ok;
  }

  /** @param {PointerEvent} event */
  function onMove(event) {
    if (gesture === null) return;
    const g = gesture;
    g.moved ||= Math.hypot(event.clientX - g.startScreen.x, event.clientY - g.startScreen.y) > CLICK_SLOP_PX;
    if (g.type === 'pan') {
      stage.panBy(event.clientX - g.last.x, event.clientY - g.last.y);
      g.last = { x: event.clientX, y: event.clientY };
      return;
    }
    const point = sourcePoint(event);
    const dx = point.x - g.startPoint.x;
    const dy = point.y - g.startPoint.y;
    const snapping = snapEnabled && !(event.ctrlKey || event.metaKey);

    if (g.type === 'marquee') {
      if (!g.moved) return;
      const marquee = rectBetween(g.startPoint, point);
      place(marqueeBox, toScreen(marquee));
      marqueeBox.hidden = false;
      const hits = marqueeHits(layers().filter((layer) => isSelectableOnCanvas(layer, isIdentity)), marquee);
      editor.select(event.shiftKey ? [...new Set([...g.baseSelection, ...hits])] : hits);
      return;
    }

    const startBox = /** @type {Rect} */ (g.startBox);
    const ids = Object.keys(g.startRects);
    /** @type {import('./canvas-snapping.js').Guide[]} */
    let guides = [];
    /** @type {Record<string, Rect>} */
    let rects;
    if (g.type === 'move') {
      const box = moveRect(startBox, dx, dy, { lockAxis: event.shiftKey });
      let sx = 0;
      let sy = 0;
      if (snapping) {
        const snapped = snapMove(box, targetsFor(ids), snapThreshold());
        sx = snapped.dx;
        sy = snapped.dy;
        guides = snapped.guides;
      }
      const ddx = box.x + sx - startBox.x;
      const ddy = box.y + sy - startBox.y;
      rects = Object.fromEntries(ids.map((id) => [id, { ...g.startRects[id], x: g.startRects[id].x + ddx, y: g.startRects[id].y + ddy }]));
      showReadout(`X ${Math.round(box.x + sx)} · Y ${Math.round(box.y + sy)}`);
    } else {
      const handle = /** @type {Handle} */ (g.handle);
      let box = resizeRect(startBox, handle, dx, dy, { keepRatio: event.shiftKey, fromCenter: event.altKey });
      if (snapping && !event.shiftKey && !event.altKey) {
        const snapped = snapResize(box, handle, targetsFor(ids), snapThreshold());
        box = snapped.box;
        guides = snapped.guides;
      }
      rects = scaleRectsWithin(startBox, box, g.startRects);
      showReadout(`${Math.round(box.width)} × ${Math.round(box.height)} px`);
    }
    showGuides(guides);
    if (commit(rects, g.type === 'move' ? 'Déplacer' : 'Redimensionner', `canvas:${g.type}:${ids.join(',')}`)) g.changed = true;
  }

  /** @param {PointerEvent} event */
  function onUp(event) {
    if (gesture === null) return;
    const g = gesture;
    gesture = null;
    try { overlay.releasePointerCapture(g.pointerId); } catch { /* capture déjà relâchée */ }
    marqueeBox.hidden = true;
    showGuides([]);
    showReadout(null);
    // Un clic sur le vide, sans glisser, désélectionne (Maj : conserve).
    if (g.type === 'marquee' && !g.moved && !event.shiftKey) editor.clearSelection();
    render();
  }

  /** Annule le geste en cours et défait ce qu'il avait déjà appliqué. */
  function cancelGesture() {
    if (gesture === null) return;
    const g = gesture;
    gesture = null;
    try { overlay.releasePointerCapture(g.pointerId); } catch { /* capture déjà relâchée */ }
    marqueeBox.hidden = true;
    showGuides([]);
    showReadout(null);
    if (g.changed) editor.undo();
    render();
  }

  /** @param {PointerEvent} event */
  function onDown(event) {
    overlay.focus({ preventScroll: true });
    const isPan = event.button === 1 || (event.button === 0 && spaceDown);
    if (event.button !== 0 && !isPan) return;
    event.preventDefault();
    overlay.setPointerCapture(event.pointerId);
    const startScreen = { x: event.clientX, y: event.clientY };
    const startPoint = sourcePoint(event);
    /** @type {NonNullable<typeof gesture>} */
    const base = { type: 'marquee', pointerId: event.pointerId, startPoint, startScreen, startRects: {}, startBox: null, handle: null, baseSelection: [...selection()], changed: false, moved: false, last: { x: event.clientX, y: event.clientY } };

    if (isPan) {
      gesture = { ...base, type: 'pan' };
      return;
    }
    const handleEl = /** @type {HTMLElement | null} */ ((/** @type {HTMLElement} */ (event.target)).closest('.co-handle'));
    if (handleEl !== null) {
      const movable = movableSelected();
      gesture = { ...base, type: 'resize', handle: /** @type {Handle} */ (handleEl.dataset.handle), startRects: Object.fromEntries(movable.map((layer) => [layer.id, toPixelRect(layer.placement)])), startBox: unionRect(movable.map((layer) => toPixelRect(layer.placement))) };
      return;
    }

    const hits = hitTestAll(layers(), startPoint, isIdentity);
    let hit = hits[0] ?? null;
    if (event.altKey && hits.length > 0) {
      // Alt+clic : la couche juste en dessous de celle qui est déjà sélectionnée à cet endroit.
      const current = hits.findIndex((id) => selection().includes(id));
      hit = hits[current < 0 ? 0 : Math.min(hits.length - 1, current + 1)];
    }
    if (hit === null) {
      gesture = base;
      return;
    }
    if (event.shiftKey) {
      editor.select([hit], 'toggle');
      if (!selection().includes(hit)) return;
    } else if (!selection().includes(hit) || event.altKey) {
      editor.select([hit]);
    }
    const movable = movableSelected();
    if (movable.length === 0) return;
    gesture = { ...base, type: 'move', startRects: Object.fromEntries(movable.map((layer) => [layer.id, toPixelRect(layer.placement)])), startBox: unionRect(movable.map((layer) => toPixelRect(layer.placement))) };
  }

  /** @param {PointerEvent} event */
  function onHover(event) {
    if (gesture !== null) return;
    const handleEl = /** @type {HTMLElement | null} */ ((/** @type {HTMLElement} */ (event.target)).closest('.co-handle'));
    const hit = handleEl === null ? hitTestAll(layers(), sourcePoint(event), isIdentity)[0] ?? null : null;
    overlay.style.cursor = spaceDown ? 'grab' : handleEl !== null ? HANDLE_CURSORS[/** @type {Handle} */ (handleEl.dataset.handle)] : hit !== null && selection().includes(hit) && layers().find((l) => l.id === hit)?.locked !== true ? 'move' : 'default';
    if (hit !== hoverId) {
      hoverId = hit;
      render();
    }
  }

  overlay.addEventListener('pointerdown', onDown);
  overlay.addEventListener('pointermove', (event) => { onMove(event); onHover(event); });
  overlay.addEventListener('pointerup', onUp);
  overlay.addEventListener('pointercancel', onUp);
  overlay.addEventListener('pointerleave', () => { if (hoverId !== null && gesture === null) { hoverId = null; render(); } });
  overlay.addEventListener('wheel', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    stage.zoomAt(event.deltaY < 0 ? 1.1 : 1 / 1.1, areaPoint(event));
  }, { passive: false });

  // ── Clavier ─────────────────────────────────────────────────────────────

  /** @param {KeyboardEvent} event */
  function onKeyDown(event) {
    if (event.key === ' ' && overlay.contains(/** @type {Node} */ (event.target))) {
      spaceDown = true;
      overlay.style.cursor = 'grab';
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape' && gesture !== null) {
      cancelGesture();
      event.preventDefault();
      return;
    }
    if (!overlay.contains(/** @type {Node} */ (event.target))) return;
    const chosen = selection();
    const step = event.shiftKey ? 10 : 1;
    const arrows = /** @type {Record<string, [number, number]>} */ ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] });
    if (arrows[event.key] !== undefined) {
      event.preventDefault();
      const movable = movableSelected();
      if (movable.length === 0) return;
      const [dx, dy] = arrows[event.key];
      commit(Object.fromEntries(movable.map((layer) => { const rect = toPixelRect(layer.placement); return [layer.id, { ...rect, x: rect.x + dx, y: rect.y + dy }]; })), 'Déplacer', `nudge:${movable.map((l) => l.id).join(',')}`);
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && chosen.length > 0) {
      event.preventDefault();
      const result = editor.removeLayers([...chosen]);
      if (!result.ok) input.report.error(result.message);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && chosen.length > 0) {
      event.preventDefault();
      const result = editor.duplicateLayers([...chosen]);
      if (!result.ok) input.report.error(result.message);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      editor.selectAll();
    } else if (event.key === 'Escape') {
      editor.clearSelection();
    } else if (event.key === '+' || event.key === '=') {
      stage.stepZoom(1);
    } else if (event.key === '-') {
      stage.stepZoom(-1);
    } else if (event.key === '0') {
      stage.fit();
    } else if (event.key === '1') {
      stage.setScale(1);
    }
  }
  /** @param {KeyboardEvent} event */
  function onKeyUp(event) {
    if (event.key !== ' ') return;
    spaceDown = false;
    overlay.style.cursor = 'default';
  }
  documentRef.addEventListener('keydown', onKeyDown);
  documentRef.addEventListener('keyup', onKeyUp);

  const unsubscribeStage = stage.subscribe(render);
  const unsubscribeDocument = studio.subscribe(render);
  render();

  return {
    render,
    /** Active ou non l'aimantation. @param {boolean} enabled */
    setSnapEnabled(enabled) { snapEnabled = enabled; },
    isSnapEnabled: () => snapEnabled,
    /** Propose les marges de sécurité comme cibles d'aimantation (pixels de la source), ou `null`. @param {number | null} margin */
    setSafeMargin(margin) { safeMargin = margin; },
    destroy() {
      documentRef.removeEventListener('keydown', onKeyDown);
      documentRef.removeEventListener('keyup', onKeyUp);
      unsubscribeStage();
      unsubscribeDocument();
    },
  };
}
