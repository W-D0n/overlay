// @ts-check
/**
 * studio/canvas/canvas-overlay-controller.js — La manipulation directe sur l'aperçu : sélectionner, déplacer, redimensionner, aimanter,
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
 * Un groupe se vise là où l'une de ses couches est, et se manipule d'un bloc par sa boîte ; Alt+clic descend dans ses couches. Un groupe masqué ou verrouillé masque ou verrouille ses couches.
 *
 * @typedef {import('./canvas-geometry.js').Rect} Rect
 * @typedef {import('./canvas-geometry.js').Handle} Handle
 */
import { RENDER_REFERENCE } from '../../src/render/render-reference.js';
import { isEffectivelyLocked, isEffectivelyVisible, selectionRoots, withMembers } from '../../src/layers/layer-group.js';
import {
  HANDLES, HANDLE_CURSORS, fromPixelRect, handlePoints, hitTestAll, isSelectableOnCanvas, marqueeHits, rectBetween, toPixelRect, unionRect,
} from './canvas-geometry.js';
import { cursorFor, dragResult, pickOnDown } from './canvas-gestures.js';
import { canvasKeyAction } from './canvas-keys.js';
import { collectTargets } from './canvas-snapping.js';
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
 *   studio: ReturnType<typeof import('../editor/studio-document.js').createStudioDocument>,
 *   isIdentity: (kind: string) => boolean,
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   onContextMenu?: (x: number, y: number) => void,
 *   documentRef?: Document,
 *   windowRef?: Window,
 * }} input
 */
export function createCanvasOverlayController(input) {
  const documentRef = input.documentRef ?? document;
  const { area, overlay, stage, studio, isIdentity } = input;
  const { editor } = studio;

  /** Marge de sécurité proposée comme cible d'aimantation, en pixels de la source, ou `null`. */
  let safeMargin = /** @type {{ x: number, y: number } | null} */ (null);
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

  /** Les couches sélectionnées qu'un geste peut modifier : visibles et non verrouillées. A group stands for its members: a layer selected with its group is left out. */
  function movableSelected() {
    const all = layers();
    const roots = selectionRoots(all, selection());
    return all.filter((layer) => roots.includes(layer.id) && isEffectivelyVisible(all, layer) && !isEffectivelyLocked(all, layer));
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
    const all = layers();
    const roots = selectionRoots(all, chosen);
    const selectedLayers = all.filter((layer) => roots.includes(layer.id) && isEffectivelyVisible(all, layer));
    const allUnlocked = selectedLayers.length > 0 && selectedLayers.every((layer) => !isEffectivelyLocked(all, layer));

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
      el.classList.toggle('is-locked', isEffectivelyLocked(all, layer));
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
    // What moves does not attract itself: a moved group brings its members, and a moved member leaves the box of its own group (which changes with it).
    const all = layers();
    const excluded = new Set([...withMembers(all, movingIds), ...all.filter((layer) => movingIds.includes(layer.id) && layer.group !== undefined).map((layer) => /** @type {string} */ (layer.group))]);
    const others = all.filter((layer) => !excluded.has(layer.id) && isEffectivelyVisible(all, layer)).map((layer) => toPixelRect(layer.placement));
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

    const ids = Object.keys(g.startRects);
    const result = dragResult(
      { type: g.type, startBox: /** @type {Rect} */ (g.startBox), startRects: g.startRects, handle: g.handle },
      { dx, dy },
      event,
      snapping ? { targets: () => targetsFor(ids), threshold: snapThreshold() } : null,
    );
    showReadout(result.readout);
    showGuides(result.guides);
    if (commit(result.rects, result.label, `canvas:${g.type}:${ids.join(',')}`)) g.changed = true;
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

    const picked = pickOnDown({ hits: hitTestAll(layers(), startPoint, isIdentity), selection: selection(), altKey: event.altKey, shiftKey: event.shiftKey });
    if (picked.hit === null) {
      gesture = base;
      return;
    }
    if (picked.select !== null) editor.select(picked.select.ids, picked.select.mode);
    if (event.shiftKey && !selection().includes(picked.hit)) return;
    const movable = movableSelected();
    if (movable.length === 0) return;
    gesture = { ...base, type: 'move', startRects: Object.fromEntries(movable.map((layer) => [layer.id, toPixelRect(layer.placement)])), startBox: unionRect(movable.map((layer) => toPixelRect(layer.placement))) };
  }

  /** @param {PointerEvent} event */
  function onHover(event) {
    if (gesture !== null) return;
    const handleEl = /** @type {HTMLElement | null} */ ((/** @type {HTMLElement} */ (event.target)).closest('.co-handle'));
    const hit = handleEl === null ? hitTestAll(layers(), sourcePoint(event), isIdentity)[0] ?? null : null;
    const handle = handleEl === null ? null : /** @type {Handle} */ (handleEl.dataset.handle);
    const hitLayer = hit === null ? undefined : layers().find((layer) => layer.id === hit);
    const overMovable = hitLayer !== undefined && selection().includes(hitLayer.id) && !isEffectivelyLocked(layers(), hitLayer);
    overlay.style.cursor = cursorFor({ spaceDown, handle, overMovable });
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
  overlay.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (gesture !== null) return;
    const hit = hitTestAll(layers(), sourcePoint(event), isIdentity)[0] ?? null;
    if (hit !== null && !selection().includes(hit)) editor.select([hit]);
    input.onContextMenu?.(event.clientX, event.clientY);
  });
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
    const action = canvasKeyAction(event, chosen.length > 0);
    if (action === null) return;
    if (action.prevent) event.preventDefault();
    runKeyAction(action, chosen);
  }

  /** @param {import('./canvas-keys.js').CanvasKeyAction} action @param {string[]} chosen */
  function runKeyAction(action, chosen) {
    switch (action.type) {
      case 'nudge': nudgeSelection(action.dx, action.dy); break;
      case 'remove': reportFailure(editor.removeLayers([...chosen])); break;
      case 'duplicate': reportFailure(editor.duplicateLayers([...chosen])); break;
      case 'select-all': editor.selectAll(); break;
      case 'clear-selection': editor.clearSelection(); break;
      case 'zoom-in': stage.stepZoom(1); break;
      case 'zoom-out': stage.stepZoom(-1); break;
      case 'fit': stage.fit(); break;
      case 'actual-size': stage.setScale(1); break;
    }
  }

  /** @param {number} dx @param {number} dy */
  function nudgeSelection(dx, dy) {
    const movable = movableSelected();
    if (movable.length === 0) return;
    commit(Object.fromEntries(movable.map((layer) => { const rect = toPixelRect(layer.placement); return [layer.id, { ...rect, x: rect.x + dx, y: rect.y + dy }]; })), 'Déplacer', `nudge:${movable.map((l) => l.id).join(',')}`);
  }

  /** @param {{ ok: boolean, message?: string }} result */
  function reportFailure(result) {
    if (!result.ok) input.report.error(result.message ?? '');
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
    /** Propose les marges de sécurité comme cibles d'aimantation (pixels de la source, par axe), ou `null`. @param {{ x: number, y: number } | null} margin */
    setSafeMargin(margin) { safeMargin = margin; },
    destroy() {
      documentRef.removeEventListener('keydown', onKeyDown);
      documentRef.removeEventListener('keyup', onKeyUp);
      unsubscribeStage();
      unsubscribeDocument();
    },
  };
}
