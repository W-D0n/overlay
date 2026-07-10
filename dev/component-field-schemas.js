// @ts-check
import { GRID_MODES } from '../components/DotGridAnimated.js';

/**
 * dev/component-field-schemas.js — Schémas de champs éditables par type de composant (S8 session 5/6,
 * étendu Track B session B7 pour les effets de fond).
 *
 * Configuration statique pilotant le formulaire de `overlay-setting.html` — aucune logique ici
 * (pattern "configuration hors composant", CLAUDE.md). Un schéma par type composable, reflétant
 * exactement la signature de sa factory (`components/index.js`). `DotGridBackground` est exclu de
 * `COMPONENT_FIELD_SCHEMAS` : singleton du fond de page, jamais monté dans une couche de scène (voir
 * scene-runtime.js) — son schéma vit dans `BACKGROUND_FIELD_SCHEMAS` à la place (section Fond).
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
 *
 * @typedef {Object} FieldSchema
 * @property {string} key - Clé dans `ComponentMount.options`
 * @property {string} label - Libellé affiché
 * @property {'text'|'number'|'select'|'textarea'|'token'} type
 * @property {string[]} [choices] - Valeurs possibles si `type === 'select'`
 * @property {'color'|'border'|'radius'} [tokenCategory] - Catégorie si `type === 'token'`
 * @property {unknown} default - Valeur par défaut à l'ajout du composant
 */

/** @type {Record<string, FieldSchema[]>} */
export const COMPONENT_FIELD_SCHEMAS = {
  GoldBar: [
    { key: 'position', label: 'Position', type: 'select', choices: ['top', 'bottom'], default: 'top' },
    { key: 'opacity', label: 'Opacité', type: 'number', default: 1 },
  ],
  StatBlock: [
    { key: 'label', label: 'Libellé', type: 'text', default: 'LABEL' },
    { key: 'value', label: 'Valeur', type: 'text', default: '—' },
    { key: 'valueColor', label: 'Couleur de la valeur', type: 'token', tokenCategory: 'color', default: 'var(--color-text-primary)' },
    { key: 'minWidth', label: 'Largeur minimale', type: 'text', default: 'auto' },
  ],
  ChatFeed: [
    { key: 'maxMessages', label: 'Messages max', type: 'number', default: 8 },
    { key: 'fontSize', label: 'Taille de police', type: 'text', default: '8px' },
  ],
  PomodoroBar: [],
  AlertBanner: [
    { key: 'displayDuration', label: "Durée d'affichage (ms)", type: 'number', default: 5000 },
  ],
  Box: [
    { key: 'borderRadius', label: 'Rayon de bordure', type: 'token', tokenCategory: 'radius', default: 'var(--radius-md)' },
    { key: 'borderColor', label: 'Bordure', type: 'token', tokenCategory: 'border', default: 'var(--border-panel)' },
    { key: 'background', label: 'Fond', type: 'token', tokenCategory: 'color', default: 'var(--color-bg-panel)' },
    { key: 'className', label: 'Classe CSS (optionnel)', type: 'text', default: '' },
  ],
  Divider: [
    { key: 'orientation', label: 'Orientation', type: 'select', choices: ['horizontal', 'vertical'], default: 'horizontal' },
    { key: 'thickness', label: 'Épaisseur', type: 'text', default: '1px' },
    { key: 'color', label: 'Couleur', type: 'token', tokenCategory: 'color', default: 'var(--color-rule)' },
    { key: 'className', label: 'Classe CSS (optionnel)', type: 'text', default: '' },
  ],
  TextLabel: [
    { key: 'text', label: 'Texte', type: 'text', default: '' },
    { key: 'font', label: 'Police', type: 'select', choices: ['serif', 'mono'], default: 'serif' },
    { key: 'size', label: 'Taille', type: 'text', default: '16px' },
    { key: 'color', label: 'Couleur', type: 'token', tokenCategory: 'color', default: 'var(--color-text-primary)' },
    { key: 'weight', label: 'Graisse', type: 'text', default: '400' },
    { key: 'className', label: 'Classe CSS (optionnel)', type: 'text', default: '' },
    { key: 'tag', label: 'Balise HTML', type: 'text', default: 'div' },
  ],
  TextList: [
    { key: 'lines', label: 'Lignes (une par ligne)', type: 'textarea', default: [] },
    { key: 'itemClass', label: 'Classe CSS par ligne', type: 'text', default: '' },
  ],
  PollBar: [
    { key: 'question', label: 'Question', type: 'text', default: '' },
    { key: 'yesRatio', label: 'Ratio "oui" (0-1)', type: 'number', default: 0 },
  ],
  Badge: [
    { key: 'text', label: 'Texte', type: 'text', default: '' },
    { key: 'color', label: 'Couleur de fond', type: 'token', tokenCategory: 'color', default: 'var(--color-gold)' },
  ],
  Image: [
    { key: 'src', label: 'Chemin asset local', type: 'text', default: '' },
    { key: 'width', label: 'Largeur (optionnel)', type: 'text', default: '' },
    { key: 'height', label: 'Hauteur (optionnel)', type: 'text', default: '' },
  ],
};

/** Types composables proposés par le sélecteur d'ajout — `DotGridBackground` exclu (singleton). */
export const COMPOSABLE_COMPONENT_NAMES = Object.keys(COMPONENT_FIELD_SCHEMAS);

/**
 * Schémas des effets de fond (Track B, section Fond de `overlay-setting.html`) — même format que
 * `COMPONENT_FIELD_SCHEMAS`, reflète exactement les options de chaque `components/*Background.js`
 * (JSDoc en tête de chaque fichier, ne pas deviner). `colors` (ColorDropsBackground) réutilise le
 * type `textarea` (une couleur par ligne) — même motif que `TextList.lines`, pas un type nouveau.
 * @type {Record<string, FieldSchema[]>}
 */
export const BACKGROUND_FIELD_SCHEMAS = {
  DotGridBackground: [
    { key: 'mode', label: 'Mode ambiant', type: 'select', choices: GRID_MODES, default: 'brb' },
    { key: 'colorMode', label: 'Couleur', type: 'select', choices: ['flat', 'noise'], default: 'flat' },
  ],
  RainBackground: [
    { key: 'intensity', label: 'Intensité (0-1)', type: 'number', default: 0.5 },
    { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
    { key: 'color', label: 'Couleur', type: 'token', tokenCategory: 'color', default: 'var(--color-gold)' },
    { key: 'angle', label: 'Angle du vent (degrés)', type: 'number', default: 8 },
  ],
  MatrixGridBackground: [
    { key: 'color', label: 'Couleur', type: 'text', default: '#00ff66' },
    { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
    { key: 'gridSize', label: 'Taille de cellule (px)', type: 'number', default: 100 },
  ],
  BubbleBackground: [
    { key: 'count', label: 'Nombre de bulles', type: 'number', default: 15 },
    { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
    { key: 'color', label: 'Couleur', type: 'token', tokenCategory: 'color', default: 'var(--color-gold)' },
    { key: 'minRadius', label: 'Rayon minimum (px)', type: 'number', default: 6 },
    { key: 'maxRadius', label: 'Rayon maximum (px)', type: 'number', default: 22 },
  ],
  FirefliesBackground: [
    { key: 'count', label: 'Nombre de lucioles', type: 'number', default: 25 },
    { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
    { key: 'color', label: 'Couleur', type: 'token', tokenCategory: 'color', default: 'var(--color-gold)' },
    { key: 'flashChance', label: 'Probabilité de flash', type: 'number', default: 0.006 },
  ],
  FloatingSymbolsBackground: [
    { key: 'symbol', label: 'Motif (glyphe/emoji)', type: 'text', default: '✽' },
    { key: 'count', label: 'Nombre de symboles', type: 'number', default: 12 },
    { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
    { key: 'color', label: 'Couleur', type: 'token', tokenCategory: 'color', default: 'var(--color-gold)' },
    { key: 'minSize', label: 'Taille minimum (px)', type: 'number', default: 24 },
    { key: 'maxSize', label: 'Taille maximum (px)', type: 'number', default: 64 },
  ],
  GeometricPatternBackground: [
    { key: 'pattern', label: 'Motif', type: 'select', choices: ['diamonds', 'dots', 'angled', 'eyes'], default: 'diamonds' },
    { key: 'colorA', label: 'Couleur A', type: 'token', tokenCategory: 'color', default: 'var(--color-gold)' },
    { key: 'colorB', label: 'Couleur B', type: 'text', default: '#0b0b0c' },
    { key: 'size', label: 'Taille de cellule (px)', type: 'number', default: 100 },
    { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
    { key: 'opacity', label: 'Opacité globale (0-1)', type: 'number', default: 0.15 },
  ],
  ColorDropsBackground: [
    { key: 'count', label: 'Nombre de gouttes', type: 'number', default: 24 },
    { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
    { key: 'colors', label: 'Palette (une couleur par ligne)', type: 'textarea', default: ['var(--color-gold)', '#8A2BE2', '#1E90FF', '#DC143C'] },
    { key: 'length', label: 'Longueur de traînée (px)', type: 'number', default: 90 },
  ],
  StarsParallaxBackground: [
    { key: 'color', label: 'Couleur', type: 'text', default: '#ffffff' },
    { key: 'density', label: 'Densité (étoiles/10 000px²)', type: 'number', default: 0.06 },
    { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
  ],
  OrbitingShapesBackground: [
    { key: 'shape', label: 'Forme', type: 'select', choices: ['circle', 'triangle'], default: 'circle' },
    { key: 'count', label: 'Nombre de formes', type: 'number', default: 10 },
    { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
    { key: 'color', label: 'Couleur', type: 'token', tokenCategory: 'color', default: 'var(--color-gold)' },
    { key: 'minSize', label: 'Taille minimum (px)', type: 'number', default: 8 },
    { key: 'maxSize', label: 'Taille maximum (px)', type: 'number', default: 28 },
  ],
  ShapeMorphBackground: [
    { key: 'shape', label: 'Silhouette', type: 'select', choices: ['pizza', 'ninjaStar', 'helmet', 'shell', 'batmanMask'], default: 'pizza' },
    { key: 'size', label: 'Rayon de base (px)', type: 'number', default: 140 },
    { key: 'color', label: 'Couleur', type: 'token', tokenCategory: 'color', default: 'var(--color-gold)' },
    { key: 'x', label: 'Position X (0-1)', type: 'number', default: 0.5 },
    { key: 'y', label: 'Position Y (0-1)', type: 'number', default: 0.5 },
    { key: 'morphDuration', label: 'Durée du morph (ms)', type: 'number', default: 700 },
    { key: 'morphEasing', label: 'Easing du morph', type: 'select', choices: ['easeInOut', 'easeIn', 'easeOut', 'linear'], default: 'easeInOut' },
  ],
};

/** Noms d'effets de fond proposés par le sélecteur de la section Fond (`(aucun)` géré à part). */
export const BACKGROUND_COMPONENT_NAMES = Object.keys(BACKGROUND_FIELD_SCHEMAS);
