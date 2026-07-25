// @ts-check
import { GRID_MODES } from '../components/DotGridAnimated.js';

/**
 * dev/component-field-schemas.js — Schémas de champs éditables par effet de fond.
 *
 * Configuration statique pilotant le formulaire du tuner (`dev/background-tuner.html`) — aucune
 * logique ici (pattern "configuration hors composant", CLAUDE.md). Un schéma par effet, reflétant
 * exactement les options de sa factory `components/*Background.js`.
 *
 * `type` :
 *   - 'text'     : input texte
 *   - 'number'   : input numérique
 *   - 'select'   : liste déroulante (`choices`)
 *   - 'textarea' : une ligne par élément d'un tableau de chaînes (ex : `TextList.lines`)
 *   - 'token'    : liste déroulante des tokens `tokens.css` de la catégorie `tokenCategory`
 *                  (`dev/design-tokens.js`) + option "Personnalisé..." en secours (owner,
 *                  2026-07-05 — `var(--...)` en texte libre jugé "peu friendly", implique de
 *                  connaître les noms de variables par cœur).
 *   - 'color'    : picker visuel + couleurs nommées + saisie CSS libre
 *   - 'colors'   : liste dynamique de couleurs + gradients nommés
 *
 * @typedef {Object} FieldSchema
 * @property {string} key - Clé dans `ComponentMount.options`
 * @property {string} label - Libellé affiché
 * @property {string} [description] - Aide courte affichée sous le champ
 * @property {'text'|'number'|'select'|'textarea'|'token'|'color'|'colors'} type
 * @property {string[]} [choices] - Valeurs possibles si `type === 'select'`
 * @property {'color'|'border'|'radius'} [tokenCategory] - Catégorie si `type === 'token'`
 * @property {number} [min] - Borne basse si `type === 'number'`
 * @property {number} [max] - Borne haute si `type === 'number'`
 * @property {number} [step] - Pas si `type === 'number'`
 * @property {string} [unit] - Unité affichée à côté de la valeur
 * @property {'slider'|'number'} [control] - Présentation préférée du contrôle numérique
 * @property {unknown} default - Valeur par défaut à l'ajout du composant
 */

/**
 * Bornes et pas par nom de champ numérique, appliqués par `withNumberGuidance`.
 * Exporté pour que le test vérifie l'invariant inverse des schémas : aucune entrée ici ne doit
 * survivre au retrait de l'effet qui la consommait.
 * @type {Record<string, { min: number, max: number, step: number, unit?: string }>}
 */
export const NUMBER_FIELD_GUIDANCE = {
  opacity: { min: 0, max: 1, step: 0.01 },
  baseOpacity: { min: 0, max: 1, step: 0.01 },
  spacing: { min: 6, max: 120, step: 1, unit: 'px' },
  dotRadius: { min: 0.5, max: 8, step: 0.05, unit: 'px' },
  pulseSpeed: { min: 0, max: 5, step: 0.05 },
  angle: { min: -180, max: 180, step: 1, unit: '°' },
  glowIntensity: { min: 0, max: 3, step: 0.05 },
  reactionInterval: { min: 2, max: 300, step: 1, unit: 's' },
  reactionIntensity: { min: 0, max: 3, step: 0.05 },
  intensity: { min: 0, max: 1, step: 0.01 },
  speed: { min: 0, max: 5, step: 0.05 },
  lineWidth: { min: 0.25, max: 8, step: 0.05, unit: 'px' },
  count: { min: 1, max: 200, step: 1 },
  minRadius: { min: 1, max: 80, step: 1, unit: 'px' },
  maxRadius: { min: 2, max: 500, step: 2, unit: 'px' },
  burstMinTravel: { min: 0, max: 1, step: 0.01 },
  burstMaxTravel: { min: 0, max: 1, step: 0.01 },
  burstDuration: { min: 0.05, max: 3, step: 0.01, unit: 's' },
  burstScale: { min: 1, max: 4, step: 0.05 },
  flashChance: { min: 0, max: 0.05, step: 0.001 },
  minSize: { min: 2, max: 160, step: 1, unit: 'px' },
  maxSize: { min: 4, max: 240, step: 1, unit: 'px' },
  size: { min: 20, max: 240, step: 1, unit: 'px' },
  density: { min: 0.005, max: 0.3, step: 0.005 },
  length: { min: 10, max: 300, step: 1, unit: 'px' },
  spread: { min: 0, max: 1, step: 0.01 },
  rotationSpeed: { min: 0, max: 2, step: 0.01 },
  x: { min: 0, max: 1, step: 0.01 },
  y: { min: 0, max: 1, step: 0.01 },
  morphDuration: { min: 100, max: 5000, step: 50, unit: 'ms' },
  frequency: { min: 0, max: 5, step: 0.05, unit: '/s' },
  amplitude: { min: 0, max: 1, step: 0.01 },
};

/** @param {Record<string, FieldSchema[]>} definitions */
function withNumberGuidance(definitions) {
  return Object.fromEntries(Object.entries(definitions).map(([component, fields]) => [component, fields.map((field) => {
    if (field.type !== 'number') return field;
    const guidance = NUMBER_FIELD_GUIDANCE[field.key];
    return guidance === undefined ? field : { ...field, ...guidance, control: 'slider' };
  })]));
}

/**
 * Schémas des effets de fond — reflètent exactement les options de chaque
 * `components/*Background.js` (JSDoc en tête de chaque fichier, ne pas deviner).
 *
 * Couleurs des effets : `color`/`colors` utilisent `components/color-palette.json`, un picker
 * visuel et une saisie CSS libre (hex/rgb/oklch/var()). Les composants reçoivent toujours de
 * simples chaînes CSS ou tableaux de chaînes : la palette reste une facilité du tuner, pas une
 * dépendance du runtime.
 * @type {Record<string, FieldSchema[]>}
 */
const BACKGROUND_FIELD_DEFINITIONS = {
  DotGridBackground: [
    {
      key: 'mode',
      label: 'Profil de mouvement',
      description: 'Rythme prédéfini hérité des scènes historiques ; ne change pas la scène OBS.',
      type: 'select',
      choices: GRID_MODES,
      default: 'brb',
    },
    { key: 'colorMode', label: 'Mode de couleur', type: 'select', choices: ['flat', 'noise', 'glow'], default: 'flat' },
    { key: 'colorA', label: 'Couleur principale', type: 'color', default: '#C8B97A' },
    {
      key: 'colorB',
      label: 'Couleur secondaire (noise)',
      description: 'Utilisée comme seconde extrémité du dégradé animé en mode noise.',
      type: 'color',
      default: '#9BF0E1',
    },
    { key: 'spacing', label: 'Espacement des points (px)', type: 'number', default: 20 },
    { key: 'dotRadius', label: 'Rayon des points (px)', type: 'number', default: 2.15 },
    { key: 'baseOpacity', label: 'Opacité de base (0-1)', type: 'number', default: 0.26 },
    { key: 'pulseSpeed', label: 'Vitesse de battement', type: 'number', default: 1 },
    { key: 'angle', label: 'Orientation du bruit (degrés)', type: 'number', default: 0 },
    { key: 'glowIntensity', label: 'Intensité du glow', type: 'number', default: 1 },
    {
      key: 'reactionMode',
      label: 'Animation automatique',
      description: 'ambient alterne les quatre réactions ; none désactive le déclenchement automatique.',
      type: 'select',
      choices: ['none', 'ambient', 'follow', 'sub', 'raid', 'bits'],
      default: 'ambient',
    },
    { key: 'reactionInterval', label: 'Intervalle des animations (s)', type: 'number', default: 60 },
    { key: 'reactionIntensity', label: 'Intensité des animations', type: 'number', default: 1 },
  ],
  RainBackground: [
    { key: 'intensity', label: 'Intensité (0-1)', type: 'number', default: 0.5 },
    { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
    { key: 'color', label: 'Couleur', type: 'color', default: '#C8B97A' },
    { key: 'angle', label: 'Angle du vent (degrés)', type: 'number', default: 8 },
  ],
  BubbleBackground: [
    { key: 'count', label: 'Nombre de bulles', type: 'number', default: 15 },
    { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
    { key: 'color', label: 'Couleur', type: 'color', default: '#C8B97A' },
    { key: 'minRadius', label: 'Rayon minimum (px)', type: 'number', default: 6 },
    { key: 'maxRadius', label: 'Rayon maximum (px)', type: 'number', default: 22 },
    { key: 'burstMinTravel', label: 'Trajet minimum avant éclatement (0-1)', type: 'number', default: 0.15 },
    { key: 'burstMaxTravel', label: 'Trajet maximum avant éclatement (0-1)', type: 'number', default: 0.9 },
    { key: 'burstDuration', label: "Durée de l'éclatement (s)", type: 'number', default: 0.37 },
    { key: 'burstScale', label: "Expansion de l'anneau", type: 'number', default: 1.8 },
  ],
  FirefliesBackground: [
    { key: 'count', label: 'Nombre de lucioles', type: 'number', default: 25 },
    { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
    { key: 'color', label: 'Couleur', type: 'color', default: '#C8B97A' },
    { key: 'flashChance', label: 'Probabilité de flash', type: 'number', default: 0.006 },
  ],
  FloatingSymbolsBackground: [
    { key: 'symbol', label: 'Motif (glyphe/emoji)', type: 'text', default: '✽' },
    { key: 'count', label: 'Nombre de symboles', type: 'number', default: 12 },
    { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
    { key: 'color', label: 'Couleur', type: 'color', default: '#C8B97A' },
    { key: 'minSize', label: 'Taille minimum (px)', type: 'number', default: 24 },
    { key: 'maxSize', label: 'Taille maximum (px)', type: 'number', default: 64 },
  ],
  GeometricPatternBackground: [
    { key: 'pattern', label: 'Motif', type: 'select', choices: ['diamonds', 'dots', 'chevrons', 'eyes'], default: 'diamonds' },
    { key: 'colorA', label: 'Couleur A', type: 'color', default: '#C8B97A' },
    { key: 'colorB', label: 'Couleur B', type: 'color', default: '#0b0b0c' },
    {
      key: 'size',
      label: 'Échelle du motif (px)',
      description: 'Une valeur plus petite affiche davantage de formes.',
      type: 'number',
      default: 100,
    },
    { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
    { key: 'direction', label: 'Direction du mouvement', type: 'select', choices: ['left', 'right', 'up', 'down'], default: 'right' },
    { key: 'angle', label: 'Orientation des lignes (degrés)', type: 'number', default: 45 },
    { key: 'opacity', label: 'Opacité globale (0-1)', type: 'number', default: 0.15 },
  ],
  ColorDropsBackground: [
    { key: 'count', label: 'Nombre de gouttes', type: 'number', default: 24 },
    { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
    { key: 'colors', label: 'Palette', type: 'colors', default: ['var(--color-gold)', '#8A2BE2', '#1E90FF', '#DC143C'] },
    { key: 'length', label: 'Longueur de traînée (px)', type: 'number', default: 90 },
  ],
  StarsParallaxBackground: [
    { key: 'color', label: 'Couleur', type: 'color', default: '#ffffff' },
    { key: 'density', label: 'Densité (étoiles/10 000px²)', type: 'number', default: 0.06 },
    { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
  ],
  OrbitingShapesBackground: [
    { key: 'shape', label: 'Forme', type: 'select', choices: ['circle', 'triangle'], default: 'circle' },
    { key: 'count', label: 'Nombre de formes', type: 'number', default: 10 },
    { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
    { key: 'color', label: 'Couleur', type: 'color', default: '#C8B97A' },
    { key: 'minSize', label: 'Taille minimum (px)', type: 'number', default: 8 },
    { key: 'maxSize', label: 'Taille maximum (px)', type: 'number', default: 28 },
    { key: 'opacity', label: 'Opacité globale (0-1)', type: 'number', default: 1 },
  ],
  ShapeMorphBackground: [
    { key: 'shape', label: 'Silhouette', type: 'select', choices: ['pizza', 'ninjaStar', 'helmet', 'shell', 'batmanMask'], default: 'pizza' },
    { key: 'count', label: 'Nombre de formes', type: 'number', default: 12 },
    { key: 'spread', label: 'Étendue du pattern (0-1)', type: 'number', default: 0.82 },
    { key: 'size', label: 'Rayon de base (px)', type: 'number', default: 72 },
    { key: 'color', label: 'Couleur', type: 'color', default: '#C8B97A' },
    { key: 'opacity', label: 'Opacité globale (0-1)', type: 'number', default: 0.45 },
    { key: 'style', label: 'Style', type: 'select', choices: ['outline', 'fill', 'mixed'], default: 'mixed' },
    { key: 'rotationSpeed', label: 'Vitesse de rotation', type: 'number', default: 0.08 },
    { key: 'x', label: 'Centre X (0-1)', type: 'number', default: 0.5 },
    { key: 'y', label: 'Centre Y (0-1)', type: 'number', default: 0.5 },
    { key: 'morphDuration', label: 'Durée du morph (ms)', type: 'number', default: 700 },
    { key: 'morphEasing', label: 'Easing du morph', type: 'select', choices: ['easeInOut', 'easeIn', 'easeOut', 'linear'], default: 'easeInOut' },
  ],
  WaterRippleBackground: [
    { key: 'shape', label: 'Forme des ondes', type: 'select', choices: ['circle', 'ellipse', 'diamond'], default: 'ellipse' },
    { key: 'frequency', label: 'Gouttes par seconde', type: 'number', default: 0.8 },
    { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
    { key: 'amplitude', label: 'Amplitude (0-1)', type: 'number', default: 0.7 },
    { key: 'color', label: 'Couleur', type: 'color', default: '#C8B97A' },
    { key: 'maxRadius', label: 'Rayon maximum (px)', type: 'number', default: 180 },
    { key: 'lineWidth', label: 'Épaisseur des ondes (px)', type: 'number', default: 1.5 },
  ],
};

export const BACKGROUND_FIELD_SCHEMAS = withNumberGuidance(BACKGROUND_FIELD_DEFINITIONS);

/** Noms d'effets proposés par le sélecteur du tuner (`(aucun)` géré à part). */
export const BACKGROUND_COMPONENT_NAMES = Object.keys(BACKGROUND_FIELD_SCHEMAS);

/**
 * Libellé affiché d'un effet de fond — le suffixe technique `Background` n'apporte rien à l'écran
 * (owner, 2026-07-14). Le nom complet reste la valeur interne (registry, état, presets).
 * @param {string} name
 * @returns {string}
 */
export function backgroundEffectLabel(name) {
  return name.replace(/Background$/, '');
}
