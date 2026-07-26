// @ts-check
/**
 * branding-format.js — Couche d'identité (pseudo + réseaux) posée au-dessus du fond.
 *
 * Logique pure : normalisation, validation, et traduction de la position en styles CSS.
 * Voir docs/specs/background-branding-layer.md.
 *
 * @typedef {{
 *   name: string,
 *   lines: string[],
 *   x: number,
 *   y: number,
 *   nameSize: number,
 *   lineSize: number,
 *   color: string,
 *   opacity: number,
 * }} Branding
 */

export const MAX_BRANDING_LINES = 4;
export const MAX_BRANDING_TEXT_LENGTH = 40;

/** Tailles pensées pour le canvas de référence 2560×1440 (voir LAC-01 de la spec). */
/** @type {Branding} */
export const DEFAULT_BRANDING = Object.freeze({
  name: '',
  lines: [],
  x: 3,
  y: 92,
  nameSize: 36,
  lineSize: 18,
  color: 'var(--color-gold)',
  opacity: 0.9,
});

const BOUNDS = {
  x: [0, 100],
  y: [0, 100],
  nameSize: [10, 96],
  lineSize: [8, 48],
  opacity: [0, 1],
};

/** @param {unknown} value */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {keyof typeof BOUNDS} field
 */
function clampNumber(value, field) {
  const [min, max] = BOUNDS[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_BRANDING[field];
  return Math.min(max, Math.max(min, value));
}

/** @param {unknown} value */
function normalizeText(value) {
  return typeof value === 'string' ? value.slice(0, MAX_BRANDING_TEXT_LENGTH) : '';
}

/**
 * Ramène n'importe quelle entrée à un branding affichable. Utilisée au rendu : un état écrit par
 * une autre version ne doit jamais casser un live.
 * @param {unknown} value
 * @returns {Branding}
 */
export function normalizeBranding(value) {
  if (!isPlainObject(value)) return { ...DEFAULT_BRANDING, lines: [] };

  const lines = Array.isArray(value.lines)
    ? value.lines
      .filter((line) => typeof line === 'string' && line.trim().length > 0)
      .slice(0, MAX_BRANDING_LINES)
      .map((line) => normalizeText(line))
    : [];

  return {
    name: normalizeText(value.name),
    lines,
    x: clampNumber(value.x, 'x'),
    y: clampNumber(value.y, 'y'),
    nameSize: clampNumber(value.nameSize, 'nameSize'),
    lineSize: clampNumber(value.lineSize, 'lineSize'),
    color: typeof value.color === 'string' && value.color.length > 0 ? value.color : DEFAULT_BRANDING.color,
    opacity: clampNumber(value.opacity, 'opacity'),
  };
}

/**
 * Y a-t-il quelque chose à afficher ? Un branding sans pseudo ni ligne ne doit produire aucun nœud,
 * pas un bloc vide invisible qui traîne dans le DOM.
 * @param {Branding} branding
 * @returns {boolean}
 */
export function hasBrandingContent(branding) {
  return branding.name.trim().length > 0 || branding.lines.length > 0;
}

/**
 * Position et apparence du bloc. Le bloc s'aligne selon l'endroit où il est posé : à droite du
 * canvas il s'aligne à droite, en bas il remonte — sinon un bloc posé près d'un bord déborderait.
 * @param {Branding} branding
 * @returns {Record<string, string>}
 */
export function brandingStyles(branding) {
  const alignRight = branding.x > 50;
  const alignBottom = branding.y > 50;

  return {
    left: `${branding.x}%`,
    top: `${branding.y}%`,
    transform: `translate(${alignRight ? '-100%' : '0'}, ${alignBottom ? '-100%' : '0'})`,
    textAlign: alignRight ? 'right' : 'left',
    color: branding.color,
    opacity: String(branding.opacity),
  };
}

/**
 * Valide avant écriture. Contrairement à `normalizeBranding`, refuse au lieu de corriger : une
 * valeur fautive enregistrée est une erreur à signaler, pas à absorber.
 * @param {unknown} value
 * @returns {import('./types.js').ValidationResult}
 */
export function validateBranding(value) {
  if (value === undefined) return { ok: true, errors: [] };
  if (!isPlainObject(value)) return { ok: false, errors: ['branding : objet attendu'] };

  /** @type {string[]} */
  const errors = [];

  for (const field of /** @type {(keyof typeof BOUNDS)[]} */ (Object.keys(BOUNDS))) {
    const candidate = value[field];
    if (candidate === undefined) continue;
    const [min, max] = BOUNDS[field];
    const valid = typeof candidate === 'number' && Number.isFinite(candidate)
      && candidate >= min && candidate <= max;
    if (!valid) errors.push(`branding.${field} : nombre entre ${min} et ${max} attendu`);
  }

  if (value.name !== undefined && typeof value.name !== 'string') {
    errors.push('branding.name : texte attendu');
  }
  if (value.lines !== undefined
    && (!Array.isArray(value.lines) || value.lines.some((line) => typeof line !== 'string'))) {
    errors.push('branding.lines : tableau de textes attendu');
  }
  if (value.color !== undefined && typeof value.color !== 'string') {
    errors.push('branding.color : valeur CSS attendue');
  }

  return { ok: errors.length === 0, errors };
}
