// @ts-check
import { simplex2 } from './simplex.js';
import { buildHueShiftLUT } from './color-utils.js';

/** Fréquences/amplitude de la variabilité de couleur par bruit (LAC-02) — indépendantes du
 * tuning `MODE_PARAMS` (couche 2, opacité) : décorrélées pour éviter que la couleur et l'opacité
 * pulsent en phase au même endroit. Constantes fixes, pas encore de besoin concret de les exposer
 * par mode (zero preemptive code — à extraire vers `MODE_PARAMS` si un tuning par scène est demandé). */
const COLOR_NOISE_FREQ = 0.012;
const COLOR_NOISE_TIME_FREQ = 0.05;
const COLOR_NOISE_MAX_DEG = 30;

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
  codage    : { freqX: 0.045, freqY: 0.045, freqT: 0.79, amplitude: 0.16 },
  brb       : { freqX: 0.045, freqY: 0.045, freqT: 0.79, amplitude: 0.16 },
  interview : { freqX: 0.045, freqY: 0.045, freqT: 0.79, amplitude: 0.16 },
  react     : { freqX: 0.045, freqY: 0.045, freqT: 0.79, amplitude: 0.16 },
  creation  : { freqX: 0.045, freqY: 0.045, freqT: 0.79, amplitude: 0.16 },
  fin       : { freqX: 0.045, freqY: 0.045, freqT: 0.79, amplitude: 0.16 },
  starting  : { freqX: 0.045, freqY: 0.045, freqT: 0.79, amplitude: 0.16 },
};

/**
 * Modes ambiants DotGrid valides — clés de `MODE_PARAMS` (source unique).
 * Consommé par `resolveDotgridMode` (scene-resolve.js) pour valider un mode
 * sans redéclarer la liste (DRY).
 * @type {GridMode[]}
 */
export const GRID_MODES = /** @type {GridMode[]} */ (Object.keys(MODE_PARAMS));

/** Mode de dernier recours si `options.mode` est absent/invalide (Track B — encapsulé ici, plus de
 * champ dédié `dotgridMode` ni de `resolveDotgridMode` externe, voir AD-B4). */
const DEFAULT_MODE = 'brb';

/**
 * Valide/replie un mode ambiant : chaîne ∈ `GRID_MODES` → elle-même, sinon → `DEFAULT_MODE`.
 * @param {unknown} mode
 * @returns {GridMode}
 */
function resolveMode(mode) {
  return typeof mode === 'string' && mode in MODE_PARAMS ? /** @type {GridMode} */ (mode) : DEFAULT_MODE;
}

/** @param {number} a @param {number} b @param {number} t */
function lerp(a, b, t) { return a + (b - a) * t; }

/**
 * Fonctions d'easing pour l'interpolation numérique de `morphTo` — équivalent JS des jetons
 * `TransitionEasing` (scene-resolve.js `toCssEasing` fait le même mapping côté CSS).
 * @type {Record<string, (t: number) => number>}
 */
const EASING_FN = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2),
};

/**
 * Applique un easing à une progression brute [0,1]. Jeton hors domaine → `easeInOut`
 * (repli, cohérent avec `toCssEasing`).
 * @param {unknown} easing
 * @param {number} t - Progression brute, sera clampée à [0,1]
 * @returns {number}
 */
export function easeProgress(easing, t) {
  const fn = typeof easing === 'string' && easing in EASING_FN ? EASING_FN[/** @type {keyof typeof EASING_FN} */ (easing)] : EASING_FN.easeInOut;
  return fn(Math.min(1, Math.max(0, t)));
}

/**
 * Convertit un delta en degrés (issu de `simplex2 * maxDeg`) en index valide de `colorLUT`.
 * Pure — clampe défensivement : `simplex2` (normalisation empirique, voir `components/simplex.js`)
 * peut légèrement dépasser [-1,1], ce qui sans clamp produirait un index hors bornes du tableau
 * (`undefined` au destructuring, crash de `tick()` — bug constaté en review, 2026-07-10).
 * @param {number} deg
 * @param {number} maxDeg
 * @returns {number}
 */
export function degToLUTIndex(deg, maxDeg) {
  return Math.min(2 * maxDeg, Math.max(0, Math.round(deg) + maxDeg));
}

/**
 * Types de réaction Couche 4 valides — clés de `REACTION_DURATIONS` (source unique), un par
 * `AlertEvent.type` existant (`types.js`). `docs/specs/dotgrid-event-triggers.md`.
 * @type {readonly ('follow'|'sub'|'raid'|'bits')[]}
 */
export const REACTION_TYPES = /** @type {const} */ (['follow', 'sub', 'raid', 'bits']);

/** Durée (ms) de chaque réaction Couche 4 — une par `REACTION_TYPES`. */
const REACTION_DURATIONS = { follow: 2000, sub: 2000, raid: 3000, bits: 1500 };

/** Boost d'opacité maximal (Couche 4), additif à C1+C2 avant clamp final. */
const REACTION_AMPLITUDE = 0.5;

/** Épaisseur (px) de la bande de front de l'onde `follow`. */
const FOLLOW_BAND_HALF_WIDTH = 40;

/**
 * @param {unknown} type
 * @returns {type is 'follow'|'sub'|'raid'|'bits'}
 */
export function isValidReactionType(type) {
  return typeof type === 'string' && /** @type {readonly string[]} */ (REACTION_TYPES).includes(type);
}

/**
 * Délai (ms) avant le prochain déclenchement `ambient` — `randomValue` ∈ [0,1) injecté pour rendre
 * la fonction pure/testable (bornes 45000-90000ms, `docs/specs/dotgrid-event-triggers.md` AC-07).
 * @param {number} randomValue
 * @returns {number}
 */
export function computeAmbientDelay(randomValue) {
  return 45000 + randomValue * 45000;
}

/**
 * Calcule le delta d'opacité (Couche 4) d'un point pour la réaction active, à une progression déjà
 * calculée [0,1]. Pure — testable indépendamment du canvas/rAF (AD-1).
 * @param {{ type: 'follow'|'sub'|'raid'|'bits', params: Record<string, *> }} reaction
 * @param {number} pointIndex
 * @param {number} x
 * @param {number} y
 * @param {number} cssW
 * @param {number} cssH
 * @param {number} progress - [0,1]
 * @returns {number}
 */
export function reactionDelta(reaction, pointIndex, x, y, cssW, cssH, progress) {
  switch (reaction.type) {
    case 'follow': {
      const { cx, cy } = reaction.params;
      const maxRadius = Math.sqrt(cssW * cssW + cssH * cssH);
      const radius = progress * maxRadius;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      return REACTION_AMPLITUDE * Math.max(0, 1 - Math.abs(dist - radius) / FOLLOW_BAND_HALF_WIDTH);
    }
    case 'sub':
      return REACTION_AMPLITUDE * Math.sin(progress * Math.PI);
    case 'raid': {
      const bandWidth = cssW * 0.15;
      const bandCenter = -bandWidth + progress * (cssW + 2 * bandWidth);
      const dist = Math.abs(x - bandCenter);
      return REACTION_AMPLITUDE * Math.max(0, 1 - dist / (bandWidth / 2));
    }
    case 'bits':
      return reaction.params.indices.has(pointIndex) ? REACTION_AMPLITUDE * Math.sin(progress * Math.PI) : 0;
    default:
      return 0;
  }
}

/**
 * Construit les paramètres propres à un type de réaction (position aléatoire pour `follow`,
 * indices tirés pour `bits`) — impur (Math.random, dépend de cssW/cssH/pointCount courants),
 * appelé une seule fois au déclenchement, pas par frame.
 * @param {'follow'|'sub'|'raid'|'bits'} type
 * @param {number} cssW
 * @param {number} cssH
 * @param {number} pointCount
 * @returns {Record<string, *>}
 */
function buildReactionParams(type, cssW, cssH, pointCount) {
  if (type === 'follow') {
    const corners = [[0, 0], [cssW, 0], [0, cssH], [cssW, cssH]];
    const [cx, cy] = corners[Math.floor(Math.random() * corners.length)];
    return { cx, cy };
  }
  if (type === 'bits') {
    const target = Math.min(pointCount, 20 + Math.floor(Math.random() * 21));
    const indices = new Set();
    while (indices.size < target) indices.add(Math.floor(Math.random() * pointCount));
    return { indices };
  }
  return {};
}

/**
 * Interpole les 4 paramètres Simplex entre deux modes à une progression déjà "easée" [0,1].
 * Pure — testable indépendamment du canvas/rAF (AD-1), consommée par `morphTo` en boucle de rendu.
 * @param {{freqX:number,freqY:number,freqT:number,amplitude:number}} from
 * @param {{freqX:number,freqY:number,freqT:number,amplitude:number}} to
 * @param {number} progress
 * @returns {{freqX:number,freqY:number,freqT:number,amplitude:number}}
 */
export function lerpModeParams(from, to, progress) {
  return {
    freqX: lerp(from.freqX, to.freqX, progress),
    freqY: lerp(from.freqY, to.freqY, progress),
    freqT: lerp(from.freqT, to.freqT, progress),
    amplitude: lerp(from.amplitude, to.amplitude, progress),
  };
}

/**
 * Fond grille de points animé — direction artistique Atelier.
 *
 * Couche 1 : oscillation sinusoïdale par point (init aléatoire au chargement).
 * Couche 2 : bruit Simplex 2D ambiant, paramétré par mode scène.
 * Couche 3 : morphisme des paramètres Simplex entre deux modes (`morphTo`, Track A / transition
 * `morph` de `scene-runtime.js`). Couche 4 : réactions visuelles aux alertes stream (`trigger`,
 * `docs/specs/dotgrid-event-triggers.md`) + déclenchement `ambient` périodique automatique.
 *
 * @param {{
 *   mode?: GridMode,
 *   spacing?: number,
 *   dotRadius?: number,
 *   baseColor?: [number, number, number],
 *   baseOpacity?: number,
 *   colorMode?: 'flat' | 'noise',
 * }} [options]
 * @returns {{
 *   el: HTMLCanvasElement,
 *   setMode: (mode: unknown) => void,
 *   update: (options: unknown) => void,
 *   trigger: (payload: unknown) => void,
 *   morphTo: (options: { mode: GridMode, duration?: number, easing?: unknown }) => Promise<void>,
 *   destroy: () => void,
 * }}
 */
export function DotGridAnimated(options = {}) {
  const spacing     = options.spacing     ?? 20;
  const dotRadius   = options.dotRadius   ?? 2.15;
  const baseColor   = options.baseColor   ?? /** @type {[number,number,number]} */ ([200, 185, 122]);
  const baseOpacity = options.baseOpacity ?? 0.26;

  /** @type {GridMode} */
  let currentMode = resolveMode(options.mode);

  /** Variabilité de couleur par bruit Simplex (LAC-02) — `'flat'` = couleur unique (défaut,
   * comportement historique inchangé), `'noise'` = teinte de chaque point modulée par bruit. */
  let colorMode = options.colorMode === 'noise' ? 'noise' : 'flat';

  /** Table précalculée `hueShiftRgb(baseColor, deg)` par degré entier — `baseColor` ne change
   * jamais après l'init (voir `buildHueShiftLUT`), un seul calcul suffit pour toute la durée de
   * vie du composant, quel que soit `colorMode` (coût négligeable : 61 entrées, une fois). */
  const colorLUT = buildHueShiftLUT(baseColor, COLOR_NOISE_MAX_DEG);

  /**
   * Morph en cours (Couche 3, S9/Track A) — interpole `MODE_PARAMS` de `fromParams` vers
   * `toParams` sur `duration` ms, lu par `tick()` à la place de `MODE_PARAMS[currentMode]`.
   * `null` = pas de morph en cours (comportement Couche 2 inchangé).
   * @type {{ fromParams: {freqX:number,freqY:number,freqT:number,amplitude:number}, toParams: {freqX:number,freqY:number,freqT:number,amplitude:number}, toMode: GridMode, duration: number, easing: unknown, startTime: number, resolve: () => void } | null}
   */
  let morphState = null;

  /**
   * Réaction Couche 4 active (alerte stream ou `ambient`) — une seule à la fois, un nouveau
   * déclenchement remplace l'ancienne immédiatement (AC-06, pas de superposition/file d'attente,
   * les alertes sont rares). `null` = pas de réaction, C1+C2 seuls pilotent l'opacité.
   * @type {{ type: 'follow'|'sub'|'raid'|'bits', startTime: number, duration: number, params: Record<string, *> } | null}
   */
  let activeReaction = null;

  /** Minuteur du déclenchement `ambient` — réarmé après chaque exécution (manuelle ou auto). */
  let ambientTimerId = /** @type {ReturnType<typeof setTimeout> | 0} */ (0);

  /**
   * Démarre une réaction Couche 4. Type invalide → no-op silencieux (AC-05), cohérent avec
   * `resolveMode`/`resolveTransition` (repli plutôt qu'exception).
   * @param {string} type
   */
  function startReaction(type) {
    if (!isValidReactionType(type)) return;
    activeReaction = {
      type,
      startTime: performance.now(),
      duration: REACTION_DURATIONS[type],
      params: buildReactionParams(type, cssW, cssH, pointCount),
    };
  }

  /** Réarme le minuteur `ambient` avec un délai aléatoire 45-90s (AC-07). */
  function scheduleAmbient() {
    ambientTimerId = setTimeout(() => {
      startReaction(REACTION_TYPES[Math.floor(Math.random() * REACTION_TYPES.length)]);
      scheduleAmbient();
    }, computeAmbientDelay(Math.random()));
  }
  scheduleAmbient();

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
    let mode = MODE_PARAMS[currentMode];
    if (morphState !== null) {
      const raw = morphState.duration > 0 ? (timestamp - morphState.startTime) / morphState.duration : 1;
      const eased = easeProgress(morphState.easing, raw);
      mode = lerpModeParams(morphState.fromParams, morphState.toParams, eased);
      if (raw >= 1) {
        currentMode = morphState.toMode;
        const resolve = morphState.resolve;
        morphState = null;
        resolve();
      }
    }
    const [r, g, b] = baseColor;

    // Couche 4 — réaction active (alerte/ambient), progression [0,1] calculée une fois par frame.
    let reactionProgress = 0;
    if (activeReaction !== null) {
      reactionProgress = activeReaction.duration > 0 ? (timestamp - activeReaction.startTime) / activeReaction.duration : 1;
      if (reactionProgress >= 1) activeReaction = null;
    }

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

      // Couche 4 — boost d'opacité de la réaction active, le cas échéant
      const c3 = activeReaction !== null ? reactionDelta(activeReaction, i, x, y, cssW, cssH, reactionProgress) : 0;

      // Opacité finale : base + C1 + C2 + C3, clampée [0.04, 1]
      const opacity = Math.min(1, Math.max(0.04, baseOpacity + c1 + c2 + c3));

      if (colorMode === 'noise') {
        const deg = simplex2(
          x * COLOR_NOISE_FREQ,
          y * COLOR_NOISE_FREQ + t * COLOR_NOISE_TIME_FREQ,
        ) * COLOR_NOISE_MAX_DEG;
        // Lecture LUT (arrondi au degré entier) au lieu de recalculer hueShiftRgb par point/frame.
        const [nr, ng, nb] = colorLUT[degToLUTIndex(deg, COLOR_NOISE_MAX_DEG)];
        ctx.fillStyle = `rgba(${nr},${ng},${nb},${opacity.toFixed(3)})`;
      } else {
        ctx.fillStyle = `rgba(${r},${g},${b},${opacity.toFixed(3)})`;
      }
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
     * Changer le mode ambiant (swap instantané des paramètres Simplex). Mode invalide/absent →
     * repli interne sur `DEFAULT_MODE` (AD-B4, `docs/specs/background-effects-library.md`) —
     * jamais un no-op silencieux : l'appelant générique (`scene-runtime.js`) ne valide plus lui-même.
     * @param {unknown} mode
     */
    setMode(mode) {
      // Un morph en cours n'a plus de sens si le mode est écrasé abruptement — on résout sa
      // promesse (pas d'appelant qui reste bloqué en attente) plutôt que de la laisser pendre.
      if (morphState !== null) { morphState.resolve(); morphState = null; }
      currentMode = resolveMode(mode);
    },

    /**
     * Rafraîchit le composant avec de nouvelles options (contrat `ComponentInstance.update` générique
     * — Track B, `scene-runtime.js` l'appelle quand le composant de fond reste le même entre deux
     * scènes mais que ses options changent).
     * @param {unknown} newOptions
     */
    update(newOptions) {
      const opts = /** @type {{mode?: unknown, colorMode?: unknown} | null | undefined} */ (newOptions);
      this.setMode(opts?.mode);
      colorMode = opts?.colorMode === 'noise' ? 'noise' : 'flat';
    },

    /**
     * Déclenche une réaction visuelle Couche 4 (alerte stream) — reçoit un `AlertEvent`
     * (`{type, username, timestamp, amount?}`, même forme que `state.latestAlert`), pas une simple
     * chaîne (`docs/specs/dotgrid-event-triggers.md`). `type` hors des 4 valeurs valides → no-op
     * silencieux (AC-05).
     * @param {unknown} payload
     */
    trigger(payload) {
      const type = /** @type {{ type?: unknown } | null | undefined} */ (payload)?.type;
      if (typeof type === 'string') startReaction(type);
    },

    /**
     * Interpole les paramètres Simplex du mode courant vers `options.mode` sur `options.duration`
     * ms (Track A / transition `morph`, `scene-runtime.js`). No-op si `mode` est invalide ou déjà
     * le mode courant (rien à interpoler).
     * @param {{ mode: GridMode, duration?: number, easing?: unknown }} options
     * @returns {Promise<void>}
     */
    morphTo(options) {
      const targetMode = options?.mode;
      if (typeof targetMode !== 'string' || !(targetMode in MODE_PARAMS) || targetMode === currentMode) {
        return Promise.resolve();
      }
      const duration = typeof options.duration === 'number' && options.duration >= 0 ? options.duration : 400;
      const fromParams = { ...MODE_PARAMS[currentMode] };
      const toParams = MODE_PARAMS[targetMode];
      return new Promise((resolve) => {
        morphState = { fromParams, toParams, toMode: targetMode, duration, easing: options.easing, startTime: performance.now(), resolve };
      });
    },

    destroy() {
      cancelAnimationFrame(rafId);
      clearTimeout(ambientTimerId);
      observer.disconnect();
    },
  };
}
