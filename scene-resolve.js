// @ts-check
/**
 * scene-resolve.js — Helpers PURS consommés par le runtime (S3).
 *
 * AUCUN effet de bord : ni DOM, ni réseau, ni temps (prolonge AD-1).
 * Déterministes, importables par le navigateur (via scene-runtime.js) et par `bun test`.
 *
 * - `resolveTransition` : résout une transition en cascade (override > scène > défaut).
 * - `isLayerVisible`    : décide si une couche est visible à un niveau donné.
 * - `toCssEasing`       : mappe un jeton TransitionEasing vers une timing-function CSS.
 *
 * `resolveDotgridMode` retiré (Track B, `docs/specs/background-effects-library.md` AC-08) : le
 * mode ambiant est désormais une simple `option` de `ComponentMount` (`background`), validée par
 * le composant lui-même (`DotGridBackground`), plus par un champ dédié `dotgridMode`.
 *
 * Voir docs/specs/scene-runtime-engine.md §Helpers purs.
 */

import { DEFAULT_TRANSITION } from './protocol.js';

/**
 * Jetons TransitionEasing → timing-functions CSS. Les jetons camelCase (S2) ne sont
 * PAS des timing-functions CSS valides : les injecter bruts casserait l'easing.
 * Les clés de cette table définissent aussi le domaine valide des easings.
 * @type {Record<import('./types.js').TransitionEasing, string>}
 */
const CSS_EASING = { easeInOut: 'ease-in-out', easeIn: 'ease-in', easeOut: 'ease-out', linear: 'linear' };

/** Types de transition valides — les 5 valeurs de TransitionType. */
const TRANSITION_TYPES = ['crossfade', 'cut', 'slide', 'wipe', 'morph'];

/** Directions valides pour slide/wipe. */
const TRANSITION_DIRECTIONS = ['left', 'right', 'up', 'down'];

/** Direction de repli (AC-07). */
const DEFAULT_DIRECTION = 'right';

/** Couleur de repli du bord de balayage wipe (AC-08). */
const DEFAULT_COLOR = 'var(--color-gold)';

/**
 * @param {unknown} type
 * @returns {boolean}
 */
function isValidType(type) {
  return typeof type === 'string' && TRANSITION_TYPES.includes(type);
}

/**
 * @param {unknown} duration
 * @returns {boolean}
 */
function isValidDuration(duration) {
  return typeof duration === 'number' && duration >= 0;
}

/**
 * @param {unknown} easing
 * @returns {boolean}
 */
function isValidEasing(easing) {
  return typeof easing === 'string' && easing in CSS_EASING;
}

/**
 * @param {unknown} direction
 * @returns {boolean}
 */
function isValidDirection(direction) {
  return typeof direction === 'string' && TRANSITION_DIRECTIONS.includes(direction);
}

/**
 * @param {unknown} color
 * @returns {boolean}
 */
function isValidColor(color) {
  return typeof color === 'string' && color.length > 0;
}

/**
 * Applique les champs VALIDES de `source` sur `target` (mutation locale du brouillon).
 * Un champ invalide ou absent laisse la valeur de priorité inférieure déjà posée.
 * @param {import('./types.js').SceneTransition} target
 * @param {unknown} source
 * @returns {void}
 */
function applyValidFields(target, source) {
  if (typeof source !== 'object' || source === null) return;
  const candidate = /** @type {Record<string, unknown>} */ (source);
  if (isValidType(candidate.type)) target.type = /** @type {import('./types.js').TransitionType} */ (candidate.type);
  if (isValidDuration(candidate.duration)) target.duration = /** @type {number} */ (candidate.duration);
  if (isValidEasing(candidate.easing)) target.easing = /** @type {import('./types.js').TransitionEasing} */ (candidate.easing);
  if (isValidDirection(candidate.direction)) target.direction = /** @type {import('./types.js').TransitionDirection} */ (candidate.direction);
  if (isValidColor(candidate.color)) target.color = /** @type {string} */ (candidate.color);
}

/**
 * Résout une transition complète en cascade, champ par champ :
 * `override` > `sceneDefault` > `DEFAULT_TRANSITION`. Retourne TOUJOURS une
 * SceneTransition complète (`type`, `duration`, `easing`) — jamais `undefined`.
 *
 * @param {unknown} override     - Override d'événement (`detail.transition`), potentiellement partiel/invalide
 * @param {unknown} sceneDefault - Transition par défaut de la scène entrante
 * @returns {import('./types.js').SceneTransition}
 */
export function resolveTransition(override, sceneDefault) {
  const resolved = { ...DEFAULT_TRANSITION };
  applyValidFields(resolved, sceneDefault);
  applyValidFields(resolved, override);
  if ((resolved.type === 'slide' || resolved.type === 'wipe') && !isValidDirection(resolved.direction)) {
    resolved.direction = DEFAULT_DIRECTION;
  }
  if (resolved.type === 'wipe' && !isValidColor(resolved.color)) {
    resolved.color = DEFAULT_COLOR;
  }
  return resolved;
}

/**
 * Décide si une couche est visible à un niveau d'overlay donné.
 * Aucune logique additionnelle : l'invariant `hidden ⟹ minimal ⟹ full` est
 * garanti à la construction par `validateSceneConfig` (V7).
 *
 * @param {import('./types.js').LayerVisibility} visibility
 * @param {import('./types.js').VisibilityLevel} level
 * @returns {boolean}
 */
export function isLayerVisible(visibility, level) {
  return visibility[level] === true;
}

/**
 * Mappe un jeton `TransitionEasing` vers sa timing-function CSS.
 * Valeur hors domaine → `'ease-in-out'` (repli, cohérent avec `DEFAULT_TRANSITION.easing`).
 *
 * @param {unknown} easing
 * @returns {string}
 */
export function toCssEasing(easing) {
  if (typeof easing === 'string' && easing in CSS_EASING) {
    return CSS_EASING[/** @type {import('./types.js').TransitionEasing} */ (easing)];
  }
  return 'ease-in-out';
}
