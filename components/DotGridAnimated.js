// @ts-check
import { simplex2 } from './simplex.js';
import { resolveColor } from './color-utils.js';
import { canvasPixelRatio } from './canvas-runtime.js';

/** Fréquences de la variabilité de couleur par bruit — indépendantes de `MODE_PARAMS` (opacité)
 * pour éviter que couleur et intensité pulsent en phase. Les deux extrémités de la rampe sont
 * réglables ; la fréquence reste fixe tant qu'aucun besoin de tuning n'est exprimé. */
const COLOR_NOISE_FREQ = 0.012;
const COLOR_NOISE_TIME_FREQ = 0.05;
const COLOR_NOISE_STEPS = 64;

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
 * Rampe RGB précalculée entre les deux couleurs du mode `noise`. Évite trois interpolations par
 * point et par frame ; reconstruite uniquement quand l'une des couleurs change.
 * @param {[number, number, number]} from
 * @param {[number, number, number]} to
 * @param {number} halfSteps
 * @returns {[number, number, number][]}
 */
export function buildColorRamp(from, to, halfSteps) {
  const count = halfSteps * 2 + 1;
  return Array.from({ length: count }, (_, index) => {
    const progress = count === 1 ? 0 : index / (count - 1);
    return [
      Math.round(lerp(from[0], to[0], progress)),
      Math.round(lerp(from[1], to[1], progress)),
      Math.round(lerp(from[2], to[2], progress)),
    ];
  });
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

/** @param {unknown} value @returns {value is 'none'|'ambient'|'follow'|'sub'|'raid'|'bits'} */
function isAutoReactionMode(value) {
  return value === 'none' || value === 'ambient' || isValidReactionType(value);
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
 *   colorA?: string,
 *   colorB?: string,
 *   baseOpacity?: number,
 *   colorMode?: 'flat' | 'noise' | 'glow',
 *   glowIntensity?: number,
 *   pulseSpeed?: number,
 *   angle?: number,
 *   reactionMode?: 'none'|'ambient'|'follow'|'sub'|'raid'|'bits',
 *   reactionInterval?: number,
 *   reactionIntensity?: number,
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
  let spacing = options.spacing ?? 20;
  let dotRadius = options.dotRadius ?? 2.15;
  let baseOpacity = options.baseOpacity ?? 0.26;
  let pulseSpeed = options.pulseSpeed ?? 1;
  let angle = options.angle ?? 0;
  let glowIntensity = Math.max(0, options.glowIntensity ?? 1);
  let reactionMode = isAutoReactionMode(options.reactionMode) ? options.reactionMode : 'ambient';
  let reactionInterval = Math.max(1, options.reactionInterval ?? 60);
  let reactionIntensity = Math.max(0, options.reactionIntensity ?? 1);

  /** `baseColor` reste accepté pour les anciennes configs de scène. */
  let colorA = typeof options.colorA === 'string'
    ? resolveColor(options.colorA)
    : options.baseColor ?? /** @type {[number,number,number]} */ ([200, 185, 122]);
  let colorB = typeof options.colorB === 'string'
    ? resolveColor(options.colorB)
    : /** @type {[number,number,number]} */ ([155, 240, 225]);

  /** @type {GridMode} */
  let currentMode = resolveMode(options.mode);

  /** Variabilité de couleur par bruit Simplex (LAC-02) — `'flat'` = couleur unique (défaut,
   * comportement historique inchangé), `'noise'` = teinte de chaque point modulée par bruit. */
  let colorMode = options.colorMode === 'noise' || options.colorMode === 'glow'
    ? options.colorMode
    : 'flat';

  /** Rampe précalculée entre `colorA` et `colorB`, reconstruite uniquement quand une couleur
   * change — jamais d'interpolation RGB dans la boucle de milliers de points. */
  let colorLUT = buildColorRamp(colorA, colorB, COLOR_NOISE_STEPS);

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

  /** Réarme la réaction automatique choisie dans le tuner. */
  function scheduleAutoReaction() {
    clearTimeout(ambientTimerId);
    if (reactionMode === 'none') return;
    ambientTimerId = setTimeout(() => {
      const type = reactionMode === 'ambient'
        ? REACTION_TYPES[Math.floor(Math.random() * REACTION_TYPES.length)]
        : reactionMode;
      startReaction(type);
      scheduleAutoReaction();
    }, reactionInterval * 1000);
  }
  scheduleAutoReaction();

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
  const glowCanvas = document.createElement('canvas');
  const glowCtx = /** @type {CanvasRenderingContext2D} */ (glowCanvas.getContext('2d'));
  let glowHalfSize = 0;

  /** Sprite radial précalculé : un `drawImage` par point, aucun gradient créé dans la boucle. */
  function rebuildGlowSprite() {
    const outerRadius = Math.max(2, dotRadius * (3 + glowIntensity * 2));
    const size = Math.ceil(outerRadius * 2);
    glowCanvas.width = size;
    glowCanvas.height = size;
    glowHalfSize = size / 2;
    const gradient = glowCtx.createRadialGradient(
      glowHalfSize,
      glowHalfSize,
      0,
      glowHalfSize,
      glowHalfSize,
      glowHalfSize,
    );
    const [r, g, b] = colorA;
    gradient.addColorStop(0, `rgba(${r},${g},${b},${Math.min(1, 0.45 + glowIntensity * 0.18)})`);
    gradient.addColorStop(0.28, `rgba(${r},${g},${b},${Math.min(0.65, 0.16 + glowIntensity * 0.12)})`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
    glowCtx.clearRect(0, 0, size, size);
    glowCtx.fillStyle = gradient;
    glowCtx.fillRect(0, 0, size, size);
  }
  rebuildGlowSprite();

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
    const dpr = canvasPixelRatio();
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
    const [r, g, b] = colorA;
    const angleRad = angle * Math.PI / 180;
    const angleCos = Math.cos(angleRad);
    const angleSin = Math.sin(angleRad);
    const centerX = cssW / 2;
    const centerY = cssH / 2;

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
      const c1 = Math.sin(t * speeds[i] * pulseSpeed + phases[i]) * amplitudes[i];

      // Couche 2 — Simplex ambiant, paramétré par mode (signé)
      const centeredX = x - centerX;
      const centeredY = y - centerY;
      const noiseX = centeredX * angleCos - centeredY * angleSin;
      const noiseY = centeredX * angleSin + centeredY * angleCos;
      const c2 = simplex2(
        noiseX * mode.freqX,
        noiseY * mode.freqY + t * mode.freqT,
      ) * mode.amplitude;

      // Couche 4 — boost d'opacité de la réaction active, le cas échéant
      const c3 = activeReaction !== null
        ? reactionDelta(activeReaction, i, x, y, cssW, cssH, reactionProgress) * reactionIntensity
        : 0;

      // Opacité finale : base + C1 + C2 + C3, clampée [0.04, 1]
      const opacity = Math.min(1, Math.max(0.04, baseOpacity + c1 + c2 + c3));

      if (colorMode === 'noise') {
        const deg = simplex2(
          x * COLOR_NOISE_FREQ,
          y * COLOR_NOISE_FREQ + t * COLOR_NOISE_TIME_FREQ,
        ) * COLOR_NOISE_STEPS;
        const [nr, ng, nb] = colorLUT[degToLUTIndex(deg, COLOR_NOISE_STEPS)];
        ctx.fillStyle = `rgba(${nr},${ng},${nb},${opacity.toFixed(3)})`;
      } else {
        ctx.fillStyle = `rgba(${r},${g},${b},${opacity.toFixed(3)})`;
      }
      if (colorMode === 'glow') {
        ctx.globalAlpha = opacity;
        ctx.drawImage(glowCanvas, x - glowHalfSize, y - glowHalfSize);
        ctx.globalAlpha = 1;
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
      const opts = /** @type {Record<string, unknown>} */ (
        typeof newOptions === 'object' && newOptions !== null ? newOptions : {}
      );
      let layoutStale = false;
      let colorsStale = false;
      let glowStale = false;
      let scheduleStale = false;

      if ('mode' in opts) this.setMode(opts.mode);
      if (opts.colorMode === 'flat' || opts.colorMode === 'noise' || opts.colorMode === 'glow') {
        colorMode = opts.colorMode;
      }
      if (typeof opts.spacing === 'number' && opts.spacing > 0 && opts.spacing !== spacing) {
        spacing = opts.spacing;
        layoutStale = true;
      }
      if (typeof opts.dotRadius === 'number' && opts.dotRadius > 0 && opts.dotRadius !== dotRadius) {
        dotRadius = opts.dotRadius;
        glowStale = true;
      }
      if (typeof opts.baseOpacity === 'number') {
        baseOpacity = Math.min(1, Math.max(0, opts.baseOpacity));
      }
      if (typeof opts.pulseSpeed === 'number') pulseSpeed = Math.max(0, opts.pulseSpeed);
      if (typeof opts.angle === 'number') angle = opts.angle;
      if (typeof opts.glowIntensity === 'number' && opts.glowIntensity !== glowIntensity) {
        glowIntensity = Math.max(0, opts.glowIntensity);
        glowStale = true;
      }
      if (typeof opts.colorA === 'string') {
        colorA = resolveColor(opts.colorA);
        colorsStale = true;
        glowStale = true;
      }
      if (typeof opts.colorB === 'string') {
        colorB = resolveColor(opts.colorB);
        colorsStale = true;
      }
      if (isAutoReactionMode(opts.reactionMode) && opts.reactionMode !== reactionMode) {
        reactionMode = opts.reactionMode;
        scheduleStale = true;
      }
      if (
        typeof opts.reactionInterval === 'number'
        && opts.reactionInterval > 0
        && opts.reactionInterval !== reactionInterval
      ) {
        reactionInterval = Math.max(1, opts.reactionInterval);
        scheduleStale = true;
      }
      if (typeof opts.reactionIntensity === 'number') {
        reactionIntensity = Math.max(0, opts.reactionIntensity);
      }

      if (colorsStale) colorLUT = buildColorRamp(colorA, colorB, COLOR_NOISE_STEPS);
      if (glowStale) rebuildGlowSprite();
      if (layoutStale) handleResize();
      if (scheduleStale) scheduleAutoReaction();
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
