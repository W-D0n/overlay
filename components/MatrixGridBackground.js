// @ts-check
import { frameDeltaSeconds } from './animation-time.js';
import { resolveColor } from './color-utils.js';
import { canvasPixelRatio } from './canvas-runtime.js';

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** @param {number} edge0 @param {number} edge1 @param {number} value */
function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Projection d'une rangée depuis l'horizon vers le bord du plan.
 * @param {number} progress - profondeur normalisée 0-1
 * @param {number} span - distance horizon → bord en px
 * @param {number} perspective - courbure de la distribution
 */
export function perspectiveGridRow(progress, span, perspective) {
  return Math.max(0, span) * Math.pow(clamp(progress, 0, 1), Math.max(0.2, perspective));
}

/**
 * Limites d'une traverse dans le trapèze de perspective. `projectionRatio` correspond à la
 * distance déjà projetée à l'écran (`offset / span`), pas à la profondeur monde avant courbure.
 * @param {number} projectionRatio
 * @param {number} width
 * @param {number} vanishingXRatio
 * @param {number|{left:number,right:number}} [overscan]
 */
export function perspectiveGridBounds(projectionRatio, width, vanishingXRatio, overscan = 0) {
  const ratio = clamp(projectionRatio, 0, 1);
  const safeWidth = Math.max(0, width);
  const vanishX = safeWidth * clamp(vanishingXRatio, 0, 1);
  const margins = typeof overscan === 'number'
    ? { left: Math.max(0, overscan), right: Math.max(0, overscan) }
    : { left: Math.max(0, overscan.left), right: Math.max(0, overscan.right) };
  return {
    left: vanishX + (-margins.left - vanishX) * ratio,
    right: vanishX + (safeWidth + margins.right - vanishX) * ratio,
  };
}

/**
 * Dimensionne le plan hors viewport pour que ses bords soient déjà invisibles lorsque la grille
 * atteint `coverageRatio` de profondeur projetée. Les marges sont asymétriques : déplacer le
 * point de fuite vers la gauche agrandit surtout le côté droit, et inversement.
 * @param {number} width
 * @param {number} vanishingXRatio
 * @param {number} cellSize
 * @param {number} [coverageRatio]
 */
export function computeGridOverscan(width, vanishingXRatio, cellSize, coverageRatio = 0.1) {
  const safeWidth = Math.max(0, width);
  const cell = Math.max(1, cellSize);
  const ratio = clamp(coverageRatio, 0.02, 0.95);
  const vanishX = safeWidth * clamp(vanishingXRatio, 0, 1);
  const leftRequired = (vanishX + cell) / ratio - vanishX;
  const rightRequired = (safeWidth + cell - vanishX) / ratio - safeWidth + vanishX;
  return {
    left: Math.ceil(Math.max(cell, leftRequired) / cell) * cell,
    right: Math.ceil(Math.max(cell, rightRequired) / cell) * cell,
  };
}

/** @param {{left:number,right:number}} bounds @param {number} width */
export function gridBoundsCoverViewport(bounds, width) {
  return bounds.left <= 0 && bounds.right >= Math.max(0, width);
}

/**
 * Masque uniquement la naissance des lignes près de l'horizon. Le bord du viewport reste opaque :
 * la sortie de la rangée est déjà masquée naturellement par le clipping du canvas.
 * @param {number} progress
 * @param {number} fade
 */
export function gridLineOpacity(progress, fade) {
  const p = clamp(progress, 0, 1);
  const width = clamp(fade, 0.01, 0.49);
  return smoothstep(0, width, p);
}

/**
 * Étendue des lignes de fuite : naissance adoucie près de l'horizon, sortie au bord exact du plan.
 * @param {number} span
 * @param {number} perspective
 * @param {number} fade
 */
export function gridPlaneOffsets(span, perspective, fade) {
  return {
    start: perspectiveGridRow(fade, span, perspective),
    end: perspectiveGridRow(1, span, perspective),
  };
}

/**
 * Avance d'une rangée toutes les trois secondes à vitesse 1, quel que soit le framerate.
 * @param {number} phase
 * @param {number} speed
 * @param {number} deltaSeconds
 */
export function advanceGridPhase(phase, speed, deltaSeconds) {
  const next = phase + Math.max(0, speed) * Math.max(0, deltaSeconds) / 3;
  return ((next % 1) + 1) % 1;
}

/**
 * Grille perspective stable pour OBS.
 *
 * Le rendu Canvas 2D remplace les deux plans CSS 3D animés : aucune texture compositée,
 * aucun `rotateX` et aucune reconstruction lors d'un changement de réglage. Les rangées sont
 * pilotées au delta-temps, naissent progressivement à l'horizon puis sortent hors du canvas.
 *
 * @param {{
 *   color?: string,
 *   backgroundColor?: string,
 *   backgroundOpacity?: number,
 *   speed?: number,
 *   gridSize?: number,
 *   lineWidth?: number,
 *   opacity?: number,
 *   glow?: number,
 *   horizon?: number,
 *   vanishingX?: number,
 *   perspective?: number,
 *   fade?: number,
 *   planes?: 'both'|'floor'|'ceiling',
 * }} [options]
 * @returns {import('../types.js').ComponentInstance}
 */
export function MatrixGridBackground(options = {}) {
  let color = options.color ?? '#00ff66';
  let backgroundColor = options.backgroundColor ?? '#000000';
  let backgroundOpacity = clamp(options.backgroundOpacity ?? 1, 0, 1);
  let speed = Math.max(0, options.speed ?? 1);
  let gridSize = Math.max(24, options.gridSize ?? 100);
  let lineWidth = Math.max(0.25, options.lineWidth ?? 1.5);
  let opacity = clamp(options.opacity ?? 0.72, 0, 1);
  let glow = clamp(options.glow ?? 0.35, 0, 1);
  let horizon = clamp(options.horizon ?? 0.5, 0.05, 0.95);
  let vanishingX = clamp(options.vanishingX ?? 0.5, 0, 1);
  let perspective = Math.max(0.2, options.perspective ?? 1.6);
  let fade = clamp(options.fade ?? 0.15, 0.01, 0.49);
  let planes = normalizePlanes(options.planes);

  let rgb = resolveColor(color);
  let backgroundRgb = resolveColor(backgroundColor);

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  let cssW = 0;
  let cssH = 0;
  let rafId = 0;
  let phase = 0;
  /** @type {number | null} */
  let previousTimestamp = null;

  /**
   * @param {1|-1} sign
   * @param {number} width
   * @param {number} alphaScale
   * @param {{left:number,right:number}} overscan
   */
  function drawPlane(sign, width, alphaScale, overscan) {
    const horizonY = cssH * horizon;
    const span = sign === 1 ? cssH - horizonY : horizonY;
    if (span <= 0) return;

    const vanishX = cssW * vanishingX;
    const { start: startOffset, end: endOffset } = gridPlaneOffsets(span, perspective, fade);
    const verticalAlpha = opacity * alphaScale * 0.72;
    const [red, green, blue] = rgb;

    ctx.lineWidth = width;
    ctx.strokeStyle = `rgba(${red},${green},${blue},${verticalAlpha.toFixed(3)})`;
    ctx.beginPath();
    // Le plan peut être très large avec un point de fuite latéral. On borne le nombre de rayons
    // sans réduire le débordement, afin de garder un coût stable dans OBS.
    const verticalStep = Math.max(gridSize, (cssW + overscan.left + overscan.right) / 720);
    for (let edgeX = -overscan.left; edgeX <= cssW + overscan.right; edgeX += verticalStep) {
      const startRatio = startOffset / span;
      const endRatio = endOffset / span;
      ctx.moveTo(vanishX + (edgeX - vanishX) * startRatio, horizonY + sign * startOffset);
      ctx.lineTo(vanishX + (edgeX - vanishX) * endRatio, horizonY + sign * endOffset);
    }
    ctx.stroke();

    const rowCount = Math.max(6, Math.ceil(span / gridSize) * 2);
    for (let index = 0; index <= rowCount; index++) {
      const progress = (index + phase) / rowCount;
      if (progress > 1) continue;
      const rowAlpha = opacity * alphaScale * gridLineOpacity(progress, fade);
      if (rowAlpha <= 0.001) continue;
      const offset = perspectiveGridRow(progress, span, perspective);
      const y = horizonY + sign * offset;
      const bounds = perspectiveGridBounds(offset / span, cssW, vanishingX, overscan);
      if (!gridBoundsCoverViewport(bounds, cssW)) continue;
      ctx.strokeStyle = `rgba(${red},${green},${blue},${rowAlpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(bounds.left, y);
      ctx.lineTo(bounds.right, y);
      ctx.stroke();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, cssW, cssH);
    if (backgroundOpacity > 0) {
      const [red, green, blue] = backgroundRgb;
      ctx.fillStyle = `rgba(${red},${green},${blue},${backgroundOpacity})`;
      ctx.fillRect(0, 0, cssW, cssH);
    }

    const signs = planes === 'both' ? [1, -1] : planes === 'floor' ? [1] : [-1];
    const overscan = computeGridOverscan(cssW, vanishingX, gridSize);
    ctx.lineCap = 'round';
    if (glow > 0) {
      for (const sign of signs) drawPlane(/** @type {1|-1} */ (sign), lineWidth * (2 + glow * 5), glow * 0.18, overscan);
    }
    for (const sign of signs) drawPlane(/** @type {1|-1} */ (sign), lineWidth, 1, overscan);
  }

  /** @param {number} timestamp */
  function tick(timestamp) {
    rafId = requestAnimationFrame(tick);
    const delta = frameDeltaSeconds(previousTimestamp, timestamp);
    previousTimestamp = timestamp;
    phase = advanceGridPhase(phase, speed, delta);
    draw();
  }

  function handleResize() {
    const dpr = canvasPixelRatio();
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    if (width === 0 || height === 0) return;
    cssW = width;
    cssH = height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    previousTimestamp = null;
    if (rafId !== 0) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  const observer = new ResizeObserver(handleResize);
  observer.observe(canvas);

  return {
    el: canvas,
    /** @param {unknown} newOptions */
    update(newOptions) {
      const next = /** @type {Record<string, unknown>} */ (newOptions ?? {});
      if (typeof next.color === 'string' && next.color !== color) {
        color = next.color;
        rgb = resolveColor(color);
      }
      if (typeof next.backgroundColor === 'string' && next.backgroundColor !== backgroundColor) {
        backgroundColor = next.backgroundColor;
        backgroundRgb = resolveColor(backgroundColor);
      }
      if (typeof next.backgroundOpacity === 'number') backgroundOpacity = clamp(next.backgroundOpacity, 0, 1);
      if (typeof next.speed === 'number') speed = Math.max(0, next.speed);
      if (typeof next.gridSize === 'number') gridSize = Math.max(24, next.gridSize);
      if (typeof next.lineWidth === 'number') lineWidth = Math.max(0.25, next.lineWidth);
      if (typeof next.opacity === 'number') opacity = clamp(next.opacity, 0, 1);
      if (typeof next.glow === 'number') glow = clamp(next.glow, 0, 1);
      if (typeof next.horizon === 'number') horizon = clamp(next.horizon, 0.05, 0.95);
      if (typeof next.vanishingX === 'number') vanishingX = clamp(next.vanishingX, 0, 1);
      if (typeof next.perspective === 'number') perspective = Math.max(0.2, next.perspective);
      if (typeof next.fade === 'number') fade = clamp(next.fade, 0.01, 0.49);
      if (typeof next.planes === 'string') planes = normalizePlanes(next.planes);
    },
    destroy() {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    },
  };
}

/** @param {unknown} value @returns {'both'|'floor'|'ceiling'} */
function normalizePlanes(value) {
  return value === 'floor' || value === 'ceiling' ? value : 'both';
}
