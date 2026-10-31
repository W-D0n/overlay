// @ts-check
/**
 * layer-kinds.js — Description des types de couche (effets de fond) : donnée pure, zéro import.
 *
 * Source unique de ce que tout le monde doit savoir d'un effet sans le charger : son identifiant,
 * son libellé, ses capacités et ses champs éditables. Consommée par la validation d'état, le serveur,
 * les formulaires du Studio et le diagnostic pré-live. La fabrique qui crée l'effet vit à part
 * (`component-registry.js`) et est typée `Record<LayerKindId, …>` : oublier ou ajouter une fabrique
 * échoue au contrôle de types (`bun dev/typecheck.js`).
 *
 * `type` d'un champ : `text` (input texte), `number` (input numérique), `select` (liste, `choices`), `boolean` (case à cocher),
 * `textarea` (une ligne par élément d'un tableau de chaînes), `token` (liste des tokens `tokens.css`
 * d'une catégorie), `color` (picker + couleurs nommées + saisie CSS libre), `colors` (liste dynamique), `asset` (une image de la
 * médiathèque : son identifiant, ou vide).
 * Aucune logique ici (pattern « configuration hors composant », CLAUDE.md).
 *
 * @typedef {{ audio: boolean, reactions: 'native' | 'overlay' }} LayerCapabilities
 *   `audio` : l'effet reçoit les niveaux audio (`setAudioLevel`). `reactions` : `native` si l'effet dessine
 *   lui-même les réactions d'alerte (`trigger`), `overlay` si `ReactionOverlay` les dessine par-dessus.
 */

/**
 * @typedef {Object} FieldSchema
 * @property {string} key - Clé dans `ComponentMount.options`
 * @property {string} label - Libellé affiché
 * @property {string} [description] - Aide courte affichée sous le champ
 * @property {'text'|'number'|'select'|'boolean'|'textarea'|'token'|'color'|'colors'|'asset'} type
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
 * @typedef {Object} LayerKindDefinition
 * @property {string[]} legacyIds - Anciens noms de ce type (suffixe `Background`), lus indéfiniment
 * @property {string} label - Libellé affiché dans le Studio
 * @property {LayerCapabilities} capabilities
 * @property {FieldSchema[]} fields
 * @property {boolean} [identity] - Couche d'identité (branding), pas un effet de fond : absente du sélecteur d'effets,
 *   et dessinée au-dessus des transitions entre scènes (elle ne s'estompe pas d'une scène à l'autre)
 * @property {boolean} [content] - Couche de contenu (texte, forme, image) : posée dans la pile avec les effets, elle arrive et part
 *   avec sa scène ; ce n'est pas un effet de fond (absente des listes d'effets, de la charge de test et du banc OBS)
 */

/** Les identifiants d'asset : 32 caractères hexadécimaux (début de l'empreinte SHA-256 du contenu de l'image). */
export const ASSET_ID_PATTERN = /^[0-9a-f]{32}$/;

/** Familles de police du type `text` : les piles de `tokens.css` et des polices système sûres sous Windows. */
export const TEXT_FONTS = /** @type {const} */ (['serif', 'sans', 'mono', 'display']);

/** Formes du type `shape`. */
export const SHAPE_KINDS = /** @type {const} */ (['rectangle', 'ellipse', 'triangle', 'diamond', 'line']);

/** Modes de mouvement prédéfinis de DotGrid (hérités des scènes historiques). */
export const GRID_MODES = /** @type {const} */ ([
  'discussion', 'codage', 'brb', 'interview', 'react', 'creation', 'fin', 'starting',
]);

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
  audioIntensity: { min: 0, max: 2, step: 0.05 },
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
  fontSize: { min: 8, max: 400, step: 1, unit: 'px' },
  lineHeight: { min: 0.8, max: 2.5, step: 0.05 },
  letterSpacing: { min: -5, max: 40, step: 0.5, unit: 'px' },
  outlineWidth: { min: 0, max: 24, step: 0.5, unit: 'px' },
  shadowBlur: { min: 0, max: 60, step: 1, unit: 'px' },
  shadowOffsetX: { min: -60, max: 60, step: 1, unit: 'px' },
  shadowOffsetY: { min: -60, max: 60, step: 1, unit: 'px' },
  strokeWidth: { min: 0, max: 80, step: 0.5, unit: 'px' },
  cornerRadius: { min: 0, max: 600, step: 1, unit: 'px' },
  gradientAngle: { min: -180, max: 180, step: 1, unit: '°' },
};

/**
 * Types de couche. Couleurs : `color`/`colors` utilisent `components/color-palette.json`, un picker
 * visuel et une saisie CSS libre (hex/rgb/oklch/var()). Les effets reçoivent toujours de simples
 * chaînes CSS ou tableaux de chaînes : la palette reste une facilité du tuner, pas une dépendance du
 * runtime.
 * @satisfies {Record<string, LayerKindDefinition>}
 */
const KIND_DEFINITIONS = {
  dotgrid: {
    legacyIds: ['DotGridBackground'],
    label: 'DotGrid',
    capabilities: { audio: true, reactions: 'native' },
    fields: [
      {
        key: 'mode',
        label: 'Profil de mouvement',
        description: 'Rythme prédéfini hérité des scènes historiques ; ne change pas la scène OBS.',
        type: 'select',
        choices: [...GRID_MODES],
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
      {
        key: 'audioReactive',
        label: 'Réagit au son',
        description: 'Le fond suit le micro. OBS doit être lancé avec --enable-media-stream ; l’entrée est celle par défaut de Windows.',
        type: 'boolean',
        default: false,
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  rain: {
    legacyIds: ['RainBackground'],
    label: 'Rain',
    capabilities: { audio: true, reactions: 'overlay' },
    fields: [
      { key: 'intensity', label: 'Intensité (0-1)', type: 'number', default: 0.5 },
      { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
      { key: 'color', label: 'Couleur', type: 'color', default: '#C8B97A' },
      { key: 'angle', label: 'Angle du vent (degrés)', type: 'number', default: 8 },
      {
        key: 'audioReactive',
        label: 'Réagit au son',
        description: 'Le fond suit le micro. OBS doit être lancé avec --enable-media-stream ; l’entrée est celle par défaut de Windows.',
        type: 'boolean',
        default: false,
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  bubble: {
    legacyIds: ['BubbleBackground'],
    label: 'Bubble',
    capabilities: { audio: true, reactions: 'overlay' },
    fields: [
      { key: 'count', label: 'Nombre de bulles', type: 'number', default: 15 },
      { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
      { key: 'color', label: 'Couleur', type: 'color', default: '#C8B97A' },
      { key: 'minRadius', label: 'Rayon minimum (px)', type: 'number', default: 6 },
      { key: 'maxRadius', label: 'Rayon maximum (px)', type: 'number', default: 22 },
      { key: 'burstMinTravel', label: 'Trajet minimum avant éclatement (0-1)', type: 'number', default: 0.15 },
      { key: 'burstMaxTravel', label: 'Trajet maximum avant éclatement (0-1)', type: 'number', default: 0.9 },
      { key: 'burstDuration', label: "Durée de l'éclatement (s)", type: 'number', default: 0.37 },
      { key: 'burstScale', label: "Expansion de l'anneau", type: 'number', default: 1.8 },
      {
        key: 'audioReactive',
        label: 'Réagit au son',
        description: 'Le fond suit le micro. OBS doit être lancé avec --enable-media-stream ; l’entrée est celle par défaut de Windows.',
        type: 'boolean',
        default: false,
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  fireflies: {
    legacyIds: ['FirefliesBackground'],
    label: 'Fireflies',
    capabilities: { audio: true, reactions: 'overlay' },
    fields: [
      { key: 'count', label: 'Nombre de lucioles', type: 'number', default: 25 },
      { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
      { key: 'color', label: 'Couleur', type: 'color', default: '#C8B97A' },
      { key: 'flashChance', label: 'Probabilité de flash', type: 'number', default: 0.006 },
      {
        key: 'audioReactive',
        label: 'Réagit au son',
        description: 'Le fond suit le micro. OBS doit être lancé avec --enable-media-stream ; l’entrée est celle par défaut de Windows.',
        type: 'boolean',
        default: false,
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  'floating-symbols': {
    legacyIds: ['FloatingSymbolsBackground'],
    label: 'FloatingSymbols',
    capabilities: { audio: true, reactions: 'overlay' },
    fields: [
      { key: 'symbol', label: 'Motif (glyphe/emoji)', type: 'text', default: '✽' },
      { key: 'count', label: 'Nombre de symboles', type: 'number', default: 12 },
      { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
      { key: 'color', label: 'Couleur', type: 'color', default: '#C8B97A' },
      { key: 'minSize', label: 'Taille minimum (px)', type: 'number', default: 24 },
      { key: 'maxSize', label: 'Taille maximum (px)', type: 'number', default: 64 },
      {
        key: 'audioReactive',
        label: 'Réagit au son',
        description: 'Le fond suit le micro. OBS doit être lancé avec --enable-media-stream ; l’entrée est celle par défaut de Windows.',
        type: 'boolean',
        default: false,
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  'geometric-pattern': {
    legacyIds: ['GeometricPatternBackground'],
    label: 'GeometricPattern',
    capabilities: { audio: true, reactions: 'overlay' },
    fields: [
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
      {
        key: 'audioReactive',
        label: 'Réagit au son',
        description: 'Le fond suit le micro. OBS doit être lancé avec --enable-media-stream ; l’entrée est celle par défaut de Windows.',
        type: 'boolean',
        default: false,
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  'color-drops': {
    legacyIds: ['ColorDropsBackground'],
    label: 'ColorDrops',
    capabilities: { audio: true, reactions: 'overlay' },
    fields: [
      { key: 'count', label: 'Nombre de gouttes', type: 'number', default: 24 },
      { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
      { key: 'colors', label: 'Palette', type: 'colors', default: ['var(--color-gold)', '#8A2BE2', '#1E90FF', '#DC143C'] },
      { key: 'length', label: 'Longueur de traînée (px)', type: 'number', default: 90 },
      {
        key: 'audioReactive',
        label: 'Réagit au son',
        description: 'Le fond suit le micro. OBS doit être lancé avec --enable-media-stream ; l’entrée est celle par défaut de Windows.',
        type: 'boolean',
        default: false,
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  'stars-parallax': {
    legacyIds: ['StarsParallaxBackground'],
    label: 'StarsParallax',
    capabilities: { audio: true, reactions: 'overlay' },
    fields: [
      { key: 'color', label: 'Couleur', type: 'color', default: '#ffffff' },
      { key: 'density', label: 'Densité (étoiles/10 000px²)', type: 'number', default: 0.06 },
      { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
      {
        key: 'audioReactive',
        label: 'Réagit au son',
        description: 'Le fond suit le micro. OBS doit être lancé avec --enable-media-stream ; l’entrée est celle par défaut de Windows.',
        type: 'boolean',
        default: false,
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  'orbiting-shapes': {
    legacyIds: ['OrbitingShapesBackground'],
    label: 'OrbitingShapes',
    capabilities: { audio: true, reactions: 'overlay' },
    fields: [
      { key: 'shape', label: 'Forme', type: 'select', choices: ['circle', 'triangle'], default: 'circle' },
      { key: 'count', label: 'Nombre de formes', type: 'number', default: 10 },
      { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
      { key: 'color', label: 'Couleur', type: 'color', default: '#C8B97A' },
      { key: 'minSize', label: 'Taille minimum (px)', type: 'number', default: 8 },
      { key: 'maxSize', label: 'Taille maximum (px)', type: 'number', default: 28 },
      { key: 'opacity', label: 'Opacité globale (0-1)', type: 'number', default: 1 },
      {
        key: 'audioReactive',
        label: 'Réagit au son',
        description: 'Le fond suit le micro. OBS doit être lancé avec --enable-media-stream ; l’entrée est celle par défaut de Windows.',
        type: 'boolean',
        default: false,
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  'shape-morph': {
    legacyIds: ['ShapeMorphBackground'],
    label: 'ShapeMorph',
    capabilities: { audio: true, reactions: 'overlay' },
    fields: [
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
      {
        key: 'audioReactive',
        label: 'Réagit au son',
        description: 'Le fond suit le micro. OBS doit être lancé avec --enable-media-stream ; l’entrée est celle par défaut de Windows.',
        type: 'boolean',
        default: false,
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  branding: {
    legacyIds: [],
    label: 'Branding',
    identity: true,
    capabilities: { audio: false, reactions: 'overlay' },
    // Le texte, les tailles et la couleur sont ceux du panneau Branding (contenu global, `branding-format.js`) :
    // la couche n'a pas de réglage propre, son placement, son opacité et sa visibilité sont ceux de la couche.
    fields: [],
  },
  text: {
    legacyIds: [],
    label: 'Texte',
    content: true,
    capabilities: { audio: false, reactions: 'overlay' },
    fields: [
      { key: 'text', label: 'Texte (une ligne par ligne)', type: 'textarea', default: ['Titre'] },
      { key: 'font', label: 'Police', type: 'select', choices: [...TEXT_FONTS], default: 'serif' },
      { key: 'fontSize', label: 'Taille (px)', type: 'number', default: 96 },
      { key: 'bold', label: 'Gras', type: 'boolean', default: true },
      { key: 'italic', label: 'Italique', type: 'boolean', default: false },
      { key: 'uppercase', label: 'Majuscules', type: 'boolean', default: false },
      { key: 'color', label: 'Couleur', type: 'color', default: '#F2F0EC' },
      { key: 'align', label: 'Alignement horizontal', type: 'select', choices: ['left', 'center', 'right'], default: 'center' },
      { key: 'verticalAlign', label: 'Alignement vertical', type: 'select', choices: ['top', 'middle', 'bottom'], default: 'middle' },
      { key: 'lineHeight', label: 'Interligne', type: 'number', default: 1.2 },
      { key: 'letterSpacing', label: 'Espacement des lettres (px)', type: 'number', default: 0 },
      {
        key: 'fit',
        label: 'Ajustement à la zone',
        description: 'Réduire : la taille diminue jusqu’à ce que le texte tienne dans la zone de la couche ; Aucun : la taille réglée est gardée, le texte peut déborder.',
        type: 'select',
        choices: ['shrink', 'none'],
        default: 'shrink',
      },
      { key: 'wrap', label: 'Retour à la ligne automatique', type: 'boolean', default: true },
      { key: 'outlineWidth', label: 'Contour (px)', type: 'number', default: 0 },
      { key: 'outlineColor', label: 'Couleur du contour', type: 'color', default: '#0A0A0B' },
      { key: 'shadowBlur', label: 'Ombre : flou (px)', type: 'number', default: 0 },
      { key: 'shadowOffsetX', label: 'Ombre : décalage X (px)', type: 'number', default: 0 },
      { key: 'shadowOffsetY', label: 'Ombre : décalage Y (px)', type: 'number', default: 4 },
      { key: 'shadowColor', label: 'Couleur de l’ombre', type: 'color', default: '#000000' },
    ],
  },
  shape: {
    legacyIds: [],
    label: 'Forme',
    content: true,
    capabilities: { audio: false, reactions: 'overlay' },
    fields: [
      { key: 'shape', label: 'Forme', type: 'select', choices: [...SHAPE_KINDS], default: 'rectangle' },
      {
        key: 'fill',
        label: 'Remplissage',
        description: 'Uni, dégradé linéaire ou aucun (contour seul). Une ligne n’a pas de remplissage : elle prend la couleur et l’épaisseur du contour.',
        type: 'select',
        choices: ['solid', 'gradient', 'none'],
        default: 'solid',
      },
      { key: 'color', label: 'Couleur', type: 'color', default: '#C8B97A' },
      { key: 'color2', label: 'Seconde couleur du dégradé', type: 'color', default: '#2A2A32' },
      { key: 'gradientAngle', label: 'Angle du dégradé', type: 'number', default: 90 },
      { key: 'strokeWidth', label: 'Contour (px)', type: 'number', default: 0 },
      { key: 'strokeColor', label: 'Couleur du contour', type: 'color', default: '#F2F0EC' },
      { key: 'cornerRadius', label: 'Rayon des coins (rectangle, px)', type: 'number', default: 0 },
      { key: 'shadowBlur', label: 'Ombre : flou (px)', type: 'number', default: 0 },
      { key: 'shadowOffsetX', label: 'Ombre : décalage X (px)', type: 'number', default: 0 },
      { key: 'shadowOffsetY', label: 'Ombre : décalage Y (px)', type: 'number', default: 6 },
      { key: 'shadowColor', label: 'Couleur de l’ombre', type: 'color', default: '#000000' },
    ],
  },
  image: {
    legacyIds: [],
    label: 'Image',
    content: true,
    capabilities: { audio: false, reactions: 'overlay' },
    fields: [
      { key: 'asset', label: 'Image', description: 'Une image de la médiathèque ; importez-en une depuis la médiathèque ou en la déposant sur l’aperçu.', type: 'asset', default: '' },
      {
        key: 'fit',
        label: 'Cadrage',
        description: 'Contenir : toute l’image est visible ; Couvrir : la zone est remplie, l’image est rognée ; Étirer : l’image épouse la zone, déformée.',
        type: 'select',
        choices: ['contain', 'cover', 'fill'],
        default: 'contain',
      },
      { key: 'cornerRadius', label: 'Rayon des coins (px)', type: 'number', default: 0 },
      { key: 'strokeWidth', label: 'Contour (px)', type: 'number', default: 0 },
      { key: 'strokeColor', label: 'Couleur du contour', type: 'color', default: '#F2F0EC' },
      { key: 'shadowBlur', label: 'Ombre : flou (px)', type: 'number', default: 0 },
      { key: 'shadowOffsetX', label: 'Ombre : décalage X (px)', type: 'number', default: 0 },
      { key: 'shadowOffsetY', label: 'Ombre : décalage Y (px)', type: 'number', default: 6 },
      { key: 'shadowColor', label: 'Couleur de l’ombre', type: 'color', default: '#000000' },
    ],
  },
  'water-ripple': {
    legacyIds: ['WaterRippleBackground'],
    label: 'WaterRipple',
    capabilities: { audio: true, reactions: 'overlay' },
    fields: [
      { key: 'shape', label: 'Forme des ondes', type: 'select', choices: ['circle', 'ellipse', 'diamond'], default: 'ellipse' },
      { key: 'frequency', label: 'Gouttes par seconde', type: 'number', default: 0.8 },
      { key: 'speed', label: 'Vitesse', type: 'number', default: 1 },
      { key: 'amplitude', label: 'Amplitude (0-1)', type: 'number', default: 0.7 },
      { key: 'color', label: 'Couleur', type: 'color', default: '#C8B97A' },
      { key: 'maxRadius', label: 'Rayon maximum (px)', type: 'number', default: 180 },
      { key: 'lineWidth', label: 'Épaisseur des ondes (px)', type: 'number', default: 1.5 },
      {
        key: 'audioReactive',
        label: 'Réagit au son',
        description: 'Le fond suit le micro. OBS doit être lancé avec --enable-media-stream ; l’entrée est celle par défaut de Windows.',
        type: 'boolean',
        default: false,
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },

};

/** @typedef {keyof typeof KIND_DEFINITIONS} LayerKindId */
/** @typedef {LayerKindDefinition & { id: LayerKindId }} LayerKind */

/** @param {FieldSchema[]} fields */
function withNumberGuidance(fields) {
  return fields.map((field) => {
    if (field.type !== 'number') return field;
    const guidance = NUMBER_FIELD_GUIDANCE[field.key];
    return guidance === undefined ? field : { ...field, ...guidance, control: 'slider' };
  });
}

/** @type {Record<LayerKindId, LayerKind>} */
export const LAYER_KINDS = /** @type {*} */ (Object.fromEntries(
  Object.entries(KIND_DEFINITIONS).map(([id, definition]) => [id, {
    id,
    ...definition,
    fields: withNumberGuidance(/** @type {FieldSchema[]} */ (definition.fields)),
  }]),
));

/** Identifiants des types de couche, dans l'ordre d'affichage du sélecteur. */
export const LAYER_KIND_IDS = /** @type {LayerKindId[]} */ (Object.keys(KIND_DEFINITIONS));

/** Les effets de fond : les types de couche qui ne sont ni des couches d'identité ni des contenus. */
export const EFFECT_KIND_IDS = /** @type {LayerKindId[]} */ (LAYER_KIND_IDS.filter((id) => kindFamily(id) === 'effect'));

/** Les types de contenu : texte, forme, image. */
export const CONTENT_KIND_IDS = /** @type {LayerKindId[]} */ (LAYER_KIND_IDS.filter((id) => isContentKind(id)));

/**
 * Vrai pour une couche de contenu (texte, forme, image). Un type inconnu n'en est pas un.
 * @param {unknown} id
 */
export function isContentKind(id) {
  const kind = resolveKindId(id);
  return kind !== null && /** @type {Record<string, LayerKindDefinition>} */ (KIND_DEFINITIONS)[kind].content === true;
}

/**
 * La famille d'un type de couche : `identity` (branding), `content` (texte, forme, image) ou `effect` (effet de fond).
 * Un type inconnu est rangé parmi les effets, comme `isIdentityKind` le range hors des identités.
 * @param {unknown} id
 * @returns {'identity' | 'content' | 'effect'}
 */
export function kindFamily(id) {
  if (isIdentityKind(id)) return 'identity';
  return isContentKind(id) ? 'content' : 'effect';
}

/**
 * Vrai pour une couche d'identité (branding) : jamais un effet de fond, toujours au-dessus des transitions.
 * Un type inconnu n'en est pas une.
 * @param {unknown} id
 */
export function isIdentityKind(id) {
  const kind = resolveKindId(id);
  return kind !== null && /** @type {Record<string, LayerKindDefinition>} */ (KIND_DEFINITIONS)[kind].identity === true;
}

/**
 * Capacités déclarées d'un type de couche ; un type inconnu n'en a aucune (aucune réaction native,
 * pas de micro).
 * @param {unknown} id
 * @returns {LayerCapabilities}
 */
export function kindCapabilities(id) {
  const kind = resolveKindId(id);
  return kind === null ? { audio: false, reactions: 'overlay' } : LAYER_KINDS[kind].capabilities;
}

/** @type {Map<string, LayerKindId>} */
const LEGACY_TO_ID = new Map(
  Object.entries(KIND_DEFINITIONS).flatMap(([id, definition]) => definition.legacyIds.map((legacy) => [legacy, /** @type {LayerKindId} */ (id)])),
);

/**
 * Identifiant neutre d'un type de couche, que `value` soit l'identifiant lui-même ou un ancien nom ;
 * `null` si elle ne désigne aucun type connu.
 * @param {unknown} value
 * @returns {LayerKindId | null}
 */
export function resolveKindId(value) {
  if (typeof value !== 'string') return null;
  if (Object.hasOwn(KIND_DEFINITIONS, value)) return /** @type {LayerKindId} */ (value);
  return LEGACY_TO_ID.get(value) ?? null;
}

/** Vrai pour un identifiant neutre ou un ancien nom (lecture tolérante). @param {unknown} value */
export function isKnownKindId(value) {
  return resolveKindId(value) !== null;
}

/** @param {unknown} value @returns {value is LayerKindId} */
export function isLayerKindId(value) {
  return typeof value === 'string' && Object.hasOwn(KIND_DEFINITIONS, value);
}

/**
 * La réactivité audio d'un preset. Le booléen est la forme persistée ; l'ancien libellé « Oui » reste
 * lu (fichiers et pages antérieurs à la version 2). Seul point qui connaît cette équivalence.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isAudioOn(value) {
  return value === true || value === 'Oui';
}

/**
 * Options d'un preset ramenées aux valeurs persistées neutres (version 2) : `audioReactive`
 * « Oui » / « Non » devient un booléen. Les autres valeurs sont conservées telles quelles.
 * @param {Record<string, unknown>} options
 * @returns {Record<string, unknown>}
 */
export function neutralizeOptions(options) {
  if (options.audioReactive !== 'Oui' && options.audioReactive !== 'Non') return options;
  return { ...options, audioReactive: options.audioReactive === 'Oui' };
}

/** @param {unknown} value */
function isTextList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Message d'erreur de type pour la valeur d'un champ, ou `null` si elle convient. Le booléen accepte
 * encore l'ancien libellé « Oui » / « Non » (lecture tolérante, voir `isAudioOn`).
 * @param {FieldSchema} field
 * @param {unknown} value
 * @returns {string | null}
 */
function fieldTypeError(field, value) {
  switch (field.type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : 'nombre attendu';
    case 'boolean':
      return typeof value === 'boolean' || value === 'Oui' || value === 'Non' ? null : 'booléen attendu';
    case 'colors':
      return isTextList(value) ? null : 'liste de textes attendue';
    case 'textarea':
      return isTextList(value) ? null : 'liste de lignes attendue';
    case 'asset':
      return value === '' || (typeof value === 'string' && ASSET_ID_PATTERN.test(value)) ? null : 'identifiant d’image attendu';
    default:
      return typeof value === 'string' ? null : 'texte attendu';
  }
}

/**
 * Erreurs de type des options d'un type de couche, selon son schéma. Un champ absent ou inconnu n'est
 * pas une erreur (preset plus récent que le code chargé) ; un type de couche inconnu non plus : sa
 * validité se juge ailleurs.
 * @param {unknown} id
 * @param {Record<string, unknown>} options
 * @returns {string[]}
 */
export function validateOptions(id, options) {
  const kind = resolveKindId(id);
  if (kind === null) return [];
  /** @type {string[]} */
  const errors = [];
  for (const field of LAYER_KINDS[kind].fields) {
    if (!Object.hasOwn(options, field.key)) continue;
    const message = fieldTypeError(field, options[field.key]);
    if (message !== null) errors.push(`${field.key} : ${message}`);
  }
  return errors;
}

/**
 * Ramène chaque nombre dans les bornes de son champ. Une valeur hors plage ne doit jamais faire
 * refuser un fond en live : on la borne. Les types invalides sont laissés tels quels (`validateOptions`
 * les signale) et l'objet reçu n'est pas modifié.
 * @param {unknown} id
 * @param {Record<string, unknown>} options
 * @returns {Record<string, unknown>}
 */
export function clampOptions(id, options) {
  const kind = resolveKindId(id);
  if (kind === null) return options;
  const clamped = { ...options };
  for (const field of LAYER_KINDS[kind].fields) {
    const value = clamped[field.key];
    if (field.type !== 'number' || typeof value !== 'number' || !Number.isFinite(value)) continue;
    const low = field.min === undefined ? value : Math.max(field.min, value);
    clamped[field.key] = field.max === undefined ? low : Math.min(field.max, low);
  }
  return clamped;
}
