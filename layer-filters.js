// @ts-check
import { parseCssColor } from './components/color-utils.js';

/**
 * layer-filters.js — Les filtres d'une couche : des réglages de couleur (luminosité, contraste, saturation, teinte) et une **lueur** (un halo de couleur autour de ce que la couche dessine).
 * Module pur, sans DOM : la forme et ses bornes, la validation, la forme canonique, l'édition et le rendu en `filter` CSS. Le moteur (`scene-runtime.js`) pose le filtre sur le calque de
 * la couche, avant le flou (`Layer.blur`) pour que le halo soit flouté avec le reste. Absent = neutre : une couche sans filtre se rend comme avant. Voir docs/specs/liaisons-de-couche.md.
 *
 * @typedef {{ color: string, size: number, intensity: number }} Glow la couleur du halo (`#rrggbb`), sa portée en pixels de la source de référence, et son opacité de 0 à 1
 * @typedef {{ brightness?: number, contrast?: number, saturation?: number, hue?: number, glow?: Glow }} Filters
 * @typedef {'brightness' | 'contrast' | 'saturation' | 'hue'} AdjustKey
 */

/** Les réglages de couleur : bornes, valeur neutre (qui n'est jamais écrite), pas et libellé. */
export const ADJUSTMENTS = /** @type {const} */ ({
  brightness: Object.freeze({ label: 'Luminosité', min: 0, max: 2, neutral: 1, step: 0.05, unit: '' }),
  contrast: Object.freeze({ label: 'Contraste', min: 0, max: 2, neutral: 1, step: 0.05, unit: '' }),
  saturation: Object.freeze({ label: 'Saturation', min: 0, max: 3, neutral: 1, step: 0.05, unit: '' }),
  hue: Object.freeze({ label: 'Teinte', min: -180, max: 180, neutral: 0, step: 1, unit: '°' }),
});

export const ADJUST_KEYS = /** @type {AdjustKey[]} */ (Object.keys(ADJUSTMENTS));

export const GLOW_LIMITS = Object.freeze({
  size: Object.freeze({ min: 0, max: 60, step: 1 }),
  intensity: Object.freeze({ min: 0, max: 1, step: 0.05 }),
});

/** Le halo qu'on obtient en l'activant : la couleur d'accent, de la portée et de l'intensité d'un halo lisible. @type {Readonly<Glow>} */
export const DEFAULT_GLOW = Object.freeze({ color: '#C8B97A', size: 16, intensity: 0.8 });

const HEX = /^#[0-9a-fA-F]{6}$/;

/** @param {unknown} value @returns {value is number} */
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
/** @param {number} value @param {number} low @param {number} high */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
/** @param {number} value @param {number} places */
const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;

/**
 * Les défauts des filtres d'une couche (vide = valide).
 * @param {string} where
 * @param {unknown} filters
 * @returns {string[]}
 */
export function filterErrors(where, filters) {
  if (filters === undefined) return [];
  if (!isObject(filters)) return [`${where} : objet attendu`];
  /** @type {string[]} */
  const errors = [];
  for (const key of ADJUST_KEYS) {
    const value = filters[key];
    if (value === undefined) continue;
    const { min, max } = ADJUSTMENTS[key];
    if (!isNumber(value)) errors.push(`${where}.${key} : nombre attendu`);
    else if (value < min || value > max) errors.push(`${where}.${key} : entre ${min} et ${max} attendu`);
  }
  const { glow } = filters;
  if (glow !== undefined) {
    if (!isObject(glow)) errors.push(`${where}.glow : objet attendu`);
    else {
      if (typeof glow.color !== 'string' || !HEX.test(glow.color)) errors.push(`${where}.glow.color : couleur #rrggbb attendue`);
      for (const key of /** @type {const} */ (['size', 'intensity'])) {
        const value = glow[key];
        const { min, max } = GLOW_LIMITS[key];
        if (!isNumber(value)) errors.push(`${where}.glow.${key} : nombre attendu`);
        else if (value < min || value > max) errors.push(`${where}.glow.${key} : entre ${min} et ${max} attendu`);
      }
    }
  }
  return errors;
}

/**
 * La forme canonique : valeurs dans leurs bornes et arrondies, valeurs neutres et halo sans effet (portée ou intensité nulle) retirés, objet vide retiré (`undefined`) :
 * deux couches qui se rendent pareil s'écrivent pareil. Ce qui n'est pas un filtre valide reste tel quel : `filterErrors` le refuse.
 * @param {unknown} filters
 * @returns {unknown}
 */
export function canonicalFilters(filters) {
  if (!isObject(filters)) return filters;
  const { glow, ...adjustments } = filters;
  /** @type {Record<string, unknown>} */
  const result = { ...adjustments };
  for (const key of ADJUST_KEYS) {
    const value = adjustments[key];
    if (!isNumber(value)) continue;
    const { min, max, neutral } = ADJUSTMENTS[key];
    const bounded = round(clamp(value, min, max), 2);
    if (bounded === neutral) delete result[key];
    else result[key] = bounded;
  }
  if (glow !== undefined) {
    if (!isObject(glow) || !isNumber(glow.size) || !isNumber(glow.intensity) || typeof glow.color !== 'string') result.glow = glow;
    else {
      const size = round(clamp(glow.size, GLOW_LIMITS.size.min, GLOW_LIMITS.size.max), 1);
      const intensity = round(clamp(glow.intensity, GLOW_LIMITS.intensity.min, GLOW_LIMITS.intensity.max), 2);
      if (size > 0 && intensity > 0) result.glow = { ...glow, color: HEX.test(glow.color) ? glow.color.toLowerCase() : glow.color, size, intensity };
    }
  }
  return Object.keys(result).length === 0 ? undefined : result;
}

/**
 * Les filtres avec un réglage de couleur changé ; `null` le ramène à sa valeur neutre.
 * @param {Filters | undefined} filters
 * @param {AdjustKey} key
 * @param {number | null} value
 * @returns {Filters | undefined}
 */
export function setAdjustment(filters, key, value) {
  const { [key]: _removed, ...others } = filters ?? {};
  return /** @type {Filters | undefined} */ (canonicalFilters(value === null ? others : { ...others, [key]: value }));
}

/**
 * Les filtres avec le halo changé : `null` l'éteint ; un morceau de halo (couleur, portée, intensité) complète ce que la couche a déjà, ou le halo de départ.
 * Éteindre la portée ou l'intensité éteint le halo, qui repart ensuite de son halo de départ.
 * @param {Filters | undefined} filters
 * @param {Partial<Glow> | null} change
 * @returns {Filters | undefined}
 */
export function setGlow(filters, change) {
  const { glow, ...others } = filters ?? {};
  if (change === null) return /** @type {Filters | undefined} */ (canonicalFilters(others));
  return /** @type {Filters | undefined} */ (canonicalFilters({ ...others, glow: { ...(glow ?? DEFAULT_GLOW), ...change } }));
}

/**
 * The filters of a layer at an instant, with the values driven by a timeline or a binding laid over them: a driven color setting replaces the layer's own, and a driven glow
 * intensity sets the halo's (a layer without halo takes the starting halo, which then fades in from nothing). A driven neutral value is dropped, as in the canonical form.
 * @param {Filters | undefined} filters
 * @param {Partial<Record<AdjustKey | 'glow', number>>} driven
 * @returns {Filters | undefined}
 */
export function animatedFilters(filters, driven) {
  let result = filters;
  for (const key of ADJUST_KEYS) {
    const value = driven[key];
    if (value !== undefined) result = setAdjustment(result, key, value);
  }
  if (driven.glow !== undefined) result = setGlow(result, { intensity: driven.glow });
  return result;
}

/**
 * Le filtre CSS qui rend ces filtres : les réglages de couleur, puis le halo (une ombre sans décalage, dont la portée suit la hauteur de la source par `--reference-scale`).
 * @param {Filters | undefined} filters
 * @returns {string} vide quand il n'y a rien à rendre
 */
export function filterCss(filters) {
  if (filters === undefined) return '';
  /** @type {string[]} */
  const parts = [];
  if (filters.brightness !== undefined) parts.push(`brightness(${filters.brightness})`);
  if (filters.contrast !== undefined) parts.push(`contrast(${filters.contrast})`);
  if (filters.saturation !== undefined) parts.push(`saturate(${filters.saturation})`);
  if (filters.hue !== undefined) parts.push(`hue-rotate(${filters.hue}deg)`);
  if (filters.glow !== undefined) {
    const [r, g, b] = parseCssColor(filters.glow.color) ?? [200, 185, 122];
    parts.push(`drop-shadow(0 0 calc(var(--reference-scale, 1) * ${filters.glow.size}px) rgba(${r}, ${g}, ${b}, ${filters.glow.intensity}))`);
  }
  return parts.join(' ');
}
