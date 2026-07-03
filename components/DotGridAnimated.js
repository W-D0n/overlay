// @ts-check
import { simplex2 } from './simplex.js';

/**
 * @typedef {'discussion'|'codage'|'brb'|'interview'|'react'|'creation'|'fin'|'starting'} GridMode
 */

/**
 * Paramètres Simplex (Couche 2) par mode scène.
 * Retuning S3b (2026-07-03, feedback owner : fond trop peu visible / animation trop lente) —
 * `freqT` et `amplitude` augmentés ~1.5-2× par mode vs. HANDOFF juin 2026, écarts relatifs
 * conservés entre scènes calmes (`codage`) et dynamiques (`react`). Exporté (mutable) pour
 * `dev/dotgrid-tuner.html` — seul consommateur externe légitime, aucun autre fichier ne doit
 * muter cet objet directement.
 *
 * @type {Record<GridMode, { freqX: number, freqY: number, freqT: number, amplitude: number }>}
 */
export const MODE_PARAMS = {
  discussion: { freqX: 0.045, freqY: 0.045, freqT: 0.79, amplitude: 0.16 },
  codage    : { freqX: 0.01, freqY: 0.01, freqT: 0.2, amplitude: 0.06 },
  brb       : { freqX: 0.02, freqY: 0.02, freqT: 0.4, amplitude: 0.14 },
  interview : { freqX: 0.04, freqY: 0.02, freqT: 0.55, amplitude: 0.14 },
  react     : { freqX: 0.05, freqY: 0.05, freqT: 1, amplitude: 0.2 },
  creation  : { freqX: 0.02, freqY: 0.04, freqT: 0.45, amplitude: 0.11 },
  fin       : { freqX: 0.02, freqY: 0.02, freqT: 0.3, amplitude: 0.09 },
  starting  : { freqX: 0.02, freqY: 0.02, freqT: 0.35, amplitude: 0.12 },
};

/**
 * Modes ambiants DotGrid valides — clés de `MODE_PARAMS` (source unique).
 * Consommé par `resolveDotgridMode` (scene-resolve.js) pour valider un mode
 * sans redéclarer la liste (DRY).
 * @type {GridMode[]}
 */
export const GRID_MODES = /** @type {GridMode[]} */ (Object.keys(MODE_PARAMS));

/**
 * Fond grille de points animé — direction artistique Atelier.
 *
 * Couche 1 : oscillation sinusoïdale par point (init aléatoire au chargement).
 * Couche 2 : bruit Simplex 2D ambiant, paramétré par mode scène.
 * Couches 3-4 : stubs — implémentation prévue en Sessions 2+.
 *
 * @param {{
 *   mode?: GridMode,
 *   spacing?: number,
 *   dotRadius?: number,
 *   baseColor?: [number, number, number],
 *   baseOpacity?: number,
 * }} [options]
 * @returns {{
 *   el: HTMLCanvasElement,
 *   setMode: (mode: GridMode) => void,
 *   trigger: (eventType: string) => void,
 *   morphTo: (options: object) => Promise<void>,
 *   destroy: () => void,
 * }}
 */
export function DotGridAnimated(options = {}) {
  const spacing     = options.spacing     ?? 20;
  const dotRadius   = options.dotRadius   ?? 1.4;
  const baseColor   = options.baseColor   ?? /** @type {[number,number,number]} */ ([200, 185, 122]);
  const baseOpacity = options.baseOpacity ?? 0.26;

  /** @type {GridMode} */
  let currentMode = options.mode ?? 'brb';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = [
    'position: absolute',
    'inset: 0',
    'width: 100%',
    'height: 100%',
    'pointer-events: none',
    'z-index: var(--z-bg, 0)',
  ].join(';');

  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  // ── Données points — SoA (Structure of Arrays) ────────────────────────────
  // Trois Float32Array parallèles indexés par numéro de point.
  /** @type {Float32Array} */ let phases     = new Float32Array(0);
  /** @type {Float32Array} */ let amplitudes = new Float32Array(0);
  /** @type {Float32Array} */ let speeds     = new Float32Array(0);
  // Positions en pixels CSS (recalculées au resize)
  /** @type {Float32Array} */ let pointsX   = new Float32Array(0);
  /** @type {Float32Array} */ let pointsY   = new Float32Array(0);
  let pointCount = 0;

  // Dimensions courantes en pixels CSS (le ctx est déjà scalé par dpr)
  let cssW = 0;
  let cssH = 0;
  let rafId = 0;

  // ── Resize ────────────────────────────────────────────────────────────────

  function handleResize() {
    const dpr = window.devicePixelRatio || 1;
    const w   = canvas.offsetWidth;
    const h   = canvas.offsetHeight;

    // Pas encore dans le DOM ou dimensions nulles
    if (w === 0 || h === 0) return;

    cssW = w;
    cssH = h;

    // Réinitialiser le canvas (reset le transform implicitement)
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Reconstruire les tableaux de points
    const cols = Math.floor((w - spacing) / spacing) + 1;
    const rows = Math.floor((h - spacing) / spacing) + 1;
    pointCount  = cols * rows;

    phases     = new Float32Array(pointCount);
    amplitudes = new Float32Array(pointCount);
    speeds     = new Float32Array(pointCount);
    pointsX    = new Float32Array(pointCount);
    pointsY    = new Float32Array(pointCount);

    let idx = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        pointsX[idx] = spacing + col * spacing;
        pointsY[idx] = spacing + row * spacing;

        // Couche 1 — valeurs aléatoires uniques par chargement
        phases[idx]     = Math.random() * Math.PI * 2;
        amplitudes[idx] = 0.08 + Math.random() * 0.10;
        speeds[idx]     = 0.5  + Math.random() * 0.6;

        idx++;
      }
    }

    // Relancer la boucle proprement
    if (rafId !== 0) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  // ── Tick (rendu pur, appelé à chaque frame) ───────────────────────────────

  /**
   * @param {number} timestamp - Timestamp rAF en millisecondes
   */
  function tick(timestamp) {
    rafId = requestAnimationFrame(tick);

    ctx.clearRect(0, 0, cssW, cssH);

    const t    = timestamp * 0.001;  // secondes
    const mode = MODE_PARAMS[currentMode];
    const [r, g, b] = baseColor;

    for (let i = 0; i < pointCount; i++) {
      const x = pointsX[i];
      const y = pointsY[i];

      // Couche 1 — oscillation sinusoïdale individuelle (signée)
      const c1 = Math.sin(t * speeds[i] + phases[i]) * amplitudes[i];

      // Couche 2 — Simplex ambiant, paramétré par mode (signé)
      const c2 = simplex2(
        x * mode.freqX,
        y * mode.freqY + t * mode.freqT,
      ) * mode.amplitude;

      // Opacité finale : base + C1 + C2, clampée [0.04, 1]
      const opacity = Math.min(1, Math.max(0.04, baseOpacity + c1 + c2));

      ctx.fillStyle = `rgba(${r},${g},${b},${opacity.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Observer ──────────────────────────────────────────────────────────────

  const observer = new ResizeObserver(handleResize);
  observer.observe(canvas);

  // ── Interface publique ────────────────────────────────────────────────────

  return {
    el: canvas,

    /**
     * Changer le mode ambiant (swap instantané des paramètres Simplex).
     * @param {GridMode} mode
     */
    setMode(mode) {
      if (mode in MODE_PARAMS) currentMode = mode;
    },

    /**
     * Stub — Couche 4 (événements stream), implémentation en Session 2+.
     * @param {string} _eventType
     */
    trigger(_eventType) {},

    /**
     * Stub — Couche 3 (morphisme de forme), implémentation en Session 2+.
     * @param {object} _options
     * @returns {Promise<void>}
     */
    async morphTo(_options) {},

    destroy() {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    },
  };
}
