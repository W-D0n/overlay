// @ts-check
/**
 * dev/view-aids-controller.js — La barre de vue de l'aperçu et ses aides visuelles : zoom, aimantation, grille, règles, zones de
 * sécurité.
 *
 * Les aides se dessinent dans la zone d'aperçu d'après la transformation de la vue (`preview-stage.js`) ; elles ne touchent
 * jamais à la scène. Leur état (grille, règles, zones de sécurité, aimantation) est une préférence de l'utilisateur,
 * mémorisée dans le navigateur quand il le permet.
 *
 * - **Grille** : une maille de 120 px de la source (16 colonnes sur 9 lignes), pour caler à l'œil.
 * - **Règles** : graduations en pixels de la source sur les bords haut et gauche (`ruler-ticks.js`).
 * - **Zones de sécurité** : les retraits de 5 % (titres) et 2,5 % (action) ; avec elles, le retrait de 5 % devient aussi une
 *   cible d'aimantation.
 */
import { RENDER_REFERENCE } from '../render-reference.js';
import { rulerTicks } from './ruler-ticks.js';

const KEYS = /** @type {const} */ (['snap', 'grid', 'rulers', 'safe']);
const DEFAULTS = { snap: true, grid: false, rulers: false, safe: false };
const RULER_THICKNESS = 20;
const GRID_CELL_PX = 120;
const TITLE_SAFE = 0.05;
const ACTION_SAFE = 0.025;

/**
 * @param {{
 *   area: HTMLElement,
 *   stage: ReturnType<typeof import('./preview-stage.js').createPreviewStage>,
 *   preferences: { getPreference: (key: string, fallback: boolean) => boolean, setPreference: (key: string, value: boolean) => void, subscribe: (listener: () => void) => () => void },
 *   canvasOverlay: { setSnapEnabled(enabled: boolean): void, setSafeMargin(margin: { x: number, y: number } | null): void },
 *   elements: {
 *     zoomOut: HTMLButtonElement, zoomIn: HTMLButtonElement, zoomLabel: HTMLButtonElement, zoom100: HTMLButtonElement,
 *     snap: HTMLButtonElement, grid: HTMLButtonElement, rulers: HTMLButtonElement, safe: HTMLButtonElement,
 *   },
 *   documentRef?: Document,
 *   windowRef?: Window,
 * }} input
 */
export function createViewAidsController(input) {
  const documentRef = input.documentRef ?? document;
  const windowRef = input.windowRef ?? window;
  const { area, stage, elements } = input;

  const state = { ...DEFAULTS };
  /** Relit les préférences (au départ, et quand un autre onglet les change). */
  function readPreferences() {
    for (const key of KEYS) state[key] = input.preferences.getPreference(`view.${key}`, DEFAULTS[key]);
  }
  readPreferences();

  /** @param {string} className @param {string} [tag] */
  const make = (className, tag = 'div') => {
    const el = documentRef.createElement(tag);
    el.className = className;
    return el;
  };
  const grid = make('va-grid');
  const safeOuter = make('va-safe va-safe-action');
  const safeInner = make('va-safe va-safe-title');
  const rulerX = /** @type {HTMLCanvasElement} */ (make('va-ruler va-ruler-x', 'canvas'));
  const rulerY = /** @type {HTMLCanvasElement} */ (make('va-ruler va-ruler-y', 'canvas'));
  for (const el of [grid, safeOuter, safeInner, rulerX, rulerY]) {
    el.setAttribute('aria-hidden', 'true');
    area.appendChild(el);
  }

  /** @param {HTMLElement} el @param {{ x: number, y: number, width: number, height: number }} rect */
  function place(el, rect) {
    el.style.left = `${rect.x}px`;
    el.style.top = `${rect.y}px`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
  }

  /** @param {HTMLCanvasElement} canvas @param {'x' | 'y'} axis @param {{ scale: number, left: number, top: number }} transform */
  function paintRuler(canvas, axis, transform) {
    const ratio = windowRef.devicePixelRatio || 1;
    const length = axis === 'x' ? area.clientWidth : area.clientHeight;
    const width = axis === 'x' ? length : RULER_THICKNESS;
    const height = axis === 'x' ? RULER_THICKNESS : length;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext('2d');
    if (context === null) return;
    context.scale(ratio, ratio);
    const style = windowRef.getComputedStyle(documentRef.documentElement);
    context.fillStyle = style.getPropertyValue('--color-bg-bar').trim() || '#080808';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = style.getPropertyValue('--color-text-dim').trim() || '#85858F';
    context.fillStyle = style.getPropertyValue('--color-text-mid').trim() || '#9A9890';
    context.font = '10px monospace';
    context.textBaseline = 'top';
    context.lineWidth = 1;
    for (const tick of rulerTicks({ scale: transform.scale, offset: axis === 'x' ? transform.left : transform.top, length })) {
      const p = Math.round(tick.position) + 0.5;
      const size = tick.major ? RULER_THICKNESS : 6;
      context.beginPath();
      if (axis === 'x') { context.moveTo(p, RULER_THICKNESS - size); context.lineTo(p, RULER_THICKNESS); } else { context.moveTo(RULER_THICKNESS - size, p); context.lineTo(RULER_THICKNESS, p); }
      context.stroke();
      if (!tick.major) continue;
      if (axis === 'x') context.fillText(String(tick.value), p + 3, 2);
      else {
        context.save();
        context.translate(2, p + 3);
        context.rotate(Math.PI / 2);
        context.fillText(String(tick.value), 0, 0);
        context.restore();
      }
    }
  }

  function render() {
    const transform = stage.transform();
    const canvasRect = { x: transform.left, y: transform.top, width: RENDER_REFERENCE.width * transform.scale, height: RENDER_REFERENCE.height * transform.scale };

    grid.hidden = !state.grid;
    if (state.grid) {
      place(grid, canvasRect);
      grid.style.backgroundSize = `${GRID_CELL_PX * transform.scale}px ${GRID_CELL_PX * transform.scale}px`;
    }
    safeOuter.hidden = !state.safe;
    safeInner.hidden = !state.safe;
    if (state.safe) {
      const inset = (/** @type {number} */ ratio) => ({
        x: canvasRect.x + canvasRect.width * ratio, y: canvasRect.y + canvasRect.height * ratio,
        width: canvasRect.width * (1 - 2 * ratio), height: canvasRect.height * (1 - 2 * ratio),
      });
      place(safeOuter, inset(ACTION_SAFE));
      place(safeInner, inset(TITLE_SAFE));
    }
    rulerX.hidden = !state.rulers;
    rulerY.hidden = !state.rulers;
    if (state.rulers) {
      paintRuler(rulerX, 'x', transform);
      paintRuler(rulerY, 'y', transform);
    }

    elements.zoomLabel.textContent = stage.isFit() ? `Ajusté · ${Math.round(transform.scale * 100)} %` : `${Math.round(transform.scale * 100)} %`;
    elements.zoomIn.disabled = transform.scale >= stage.limits.max - 1e-9;
    elements.zoomOut.disabled = transform.scale <= stage.limits.min + 1e-9;
    for (const key of /** @type {const} */ (['snap', 'grid', 'rulers', 'safe'])) elements[key].setAttribute('aria-pressed', String(state[key]));
    elements.zoom100.setAttribute('aria-pressed', String(Math.abs(transform.scale - 1) < 1e-6));
    elements.zoomLabel.setAttribute('aria-pressed', String(stage.isFit()));
  }

  function apply() {
    input.canvasOverlay.setSnapEnabled(state.snap);
    input.canvasOverlay.setSafeMargin(state.safe ? { x: RENDER_REFERENCE.width * TITLE_SAFE, y: RENDER_REFERENCE.height * TITLE_SAFE } : null);
    render();
  }

  /** @param {'snap' | 'grid' | 'rulers' | 'safe'} key */
  function toggle(key) {
    state[key] = !state[key];
    input.preferences.setPreference(`view.${key}`, state[key]);
    apply();
  }

  elements.zoomOut.addEventListener('click', () => stage.stepZoom(-1));
  elements.zoomIn.addEventListener('click', () => stage.stepZoom(1));
  elements.zoomLabel.addEventListener('click', () => stage.fit());
  elements.zoom100.addEventListener('click', () => stage.setScale(1));
  elements.snap.addEventListener('click', () => toggle('snap'));
  elements.grid.addEventListener('click', () => toggle('grid'));
  elements.rulers.addEventListener('click', () => toggle('rulers'));
  elements.safe.addEventListener('click', () => toggle('safe'));

  const unsubscribe = stage.subscribe(render);
  const unsubscribePreferences = input.preferences.subscribe(() => {
    readPreferences();
    apply();
  });
  apply();

  return {
    state: () => ({ ...state }),
    /** Bascule une aide (aimantation, grille, règles, zones de sécurité). @param {'snap' | 'grid' | 'rulers' | 'safe'} key */
    toggle,
    render,
    destroy() {
      unsubscribe();
      unsubscribePreferences();
      for (const el of [grid, safeOuter, safeInner, rulerX, rulerY]) el.remove();
    },
  };
}
