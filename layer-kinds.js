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
 * `type` d'un champ : `text` (input texte), `number` (input numérique), `select` (liste, `choices`),
 * `textarea` (une ligne par élément d'un tableau de chaînes), `token` (liste des tokens `tokens.css`
 * d'une catégorie), `color` (picker + couleurs nommées + saisie CSS libre), `colors` (liste dynamique).
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
 * @typedef {Object} LayerKindDefinition
 * @property {string} label - Libellé affiché dans le Studio
 * @property {LayerCapabilities} capabilities
 * @property {FieldSchema[]} fields
 */

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
};

/**
 * Types de couche. Couleurs : `color`/`colors` utilisent `components/color-palette.json`, un picker
 * visuel et une saisie CSS libre (hex/rgb/oklch/var()). Les effets reçoivent toujours de simples
 * chaînes CSS ou tableaux de chaînes : la palette reste une facilité du tuner, pas une dépendance du
 * runtime.
 * @satisfies {Record<string, LayerKindDefinition>}
 */
const KIND_DEFINITIONS = {
  DotGridBackground: {
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
        type: 'select',
        choices: ['Non', 'Oui'],
        default: 'Non',
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  RainBackground: {
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
        type: 'select',
        choices: ['Non', 'Oui'],
        default: 'Non',
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  BubbleBackground: {
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
        type: 'select',
        choices: ['Non', 'Oui'],
        default: 'Non',
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  FirefliesBackground: {
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
        type: 'select',
        choices: ['Non', 'Oui'],
        default: 'Non',
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  FloatingSymbolsBackground: {
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
        type: 'select',
        choices: ['Non', 'Oui'],
        default: 'Non',
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  GeometricPatternBackground: {
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
        type: 'select',
        choices: ['Non', 'Oui'],
        default: 'Non',
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  ColorDropsBackground: {
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
        type: 'select',
        choices: ['Non', 'Oui'],
        default: 'Non',
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  StarsParallaxBackground: {
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
        type: 'select',
        choices: ['Non', 'Oui'],
        default: 'Non',
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  OrbitingShapesBackground: {
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
        type: 'select',
        choices: ['Non', 'Oui'],
        default: 'Non',
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  ShapeMorphBackground: {
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
        type: 'select',
        choices: ['Non', 'Oui'],
        default: 'Non',
      },
      { key: 'audioIntensity', label: 'Intensité de la réaction au son', type: 'number', default: 1 },
    ],
  },
  WaterRippleBackground: {
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
        type: 'select',
        choices: ['Non', 'Oui'],
        default: 'Non',
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

/**
 * Capacités déclarées d'un type de couche ; un type inconnu n'en a aucune (aucune réaction native,
 * pas de micro).
 * @param {unknown} id
 * @returns {LayerCapabilities}
 */
export function kindCapabilities(id) {
  return isLayerKindId(id) ? LAYER_KINDS[id].capabilities : { audio: false, reactions: 'overlay' };
}

/** @param {unknown} value @returns {value is LayerKindId} */
export function isLayerKindId(value) {
  return typeof value === 'string' && Object.hasOwn(KIND_DEFINITIONS, value);
}
