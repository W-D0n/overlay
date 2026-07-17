// @ts-check
/**
 * component-names.js — Vocabulaire des noms de composants (source unique, AD-1).
 *
 * Donnée pure, zéro import — consommée par `types.js`, `component-registry.js`, `protocol.js` et
 * `dev/component-field-schemas.js` (auparavant 4 listes tenues à la main en parallèle, review
 * architecture 2026-07-11). `protocol.js` peut l'importer sans violer AD-1 (logique pure / effets) :
 * ce module ne touche ni au DOM ni aux factories de `components/index.js`.
 */

/** @type {readonly string[]} */
export const COMPONENT_NAMES = [
  'GoldBar', 'StatBlock', 'ChatFeed', 'PomodoroBar', 'AlertBanner',
  'Box', 'Divider', 'TextLabel', 'TextList', 'PollBar', 'Badge', 'Image',
  'DotGridBackground', 'RainBackground', 'MatrixGridBackground', 'BubbleBackground',
  'FirefliesBackground', 'FloatingSymbolsBackground', 'GeometricPatternBackground',
  'ColorDropsBackground', 'StarsParallaxBackground', 'OrbitingShapesBackground',
  'ShapeMorphBackground', 'WaterRippleBackground',
];

/**
 * Un composant utilisable comme fond (`SceneConfig.background`) ? Dérivé de la convention de nommage
 * (tous les composants de fond actuels se terminent par `Background`) plutôt qu'une seconde liste à
 * maintenir en synchronisation avec `COMPONENT_NAMES`.
 * @param {string} name
 * @returns {boolean}
 */
export function isBackgroundComponent(name) {
  return name.endsWith('Background');
}
