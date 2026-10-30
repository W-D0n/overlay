// @ts-check

/**
 * Sélection éditoriale prête à appliquer depuis le Studio. Ces presets ne sont jamais écrits dans
 * l'état utilisateur tant que l'on ne choisit pas « Ajouter à mes presets ».
 * @type {import('./background-state-format.js').BackgroundPreset[]}
 */
export const BUILTIN_BACKGROUND_PRESETS = [
  {
    id: 'atelier-respiration',
    name: 'Respiration',
    component: 'dotgrid',
    tags: ['calme', 'discussion'],
    options: { mode: 'discussion', spacing: 24, dotRadius: 2, baseOpacity: 0.2, pulseSpeed: 0.55, colorA: '#C8B97A', colorB: '#5F8D89', angle: 0, glowIntensity: 0.8, reactionInterval: 90, reactionIntensity: 0.7 },
  },
  {
    id: 'atelier-ascension',
    name: 'Ascension',
    component: 'bubble',
    tags: ['brb', 'léger'],
    options: { count: 18, speed: 0.72, minRadius: 7, maxRadius: 24, color: '#C8B97A', burstMinTravel: 0.2, burstMaxTravel: 0.88, burstDuration: 0.42, burstScale: 1.7 },
  },
  {
    id: 'atelier-pluie-lente',
    name: 'Pluie lente',
    component: 'rain',
    tags: ['coding', 'concentration'],
    options: { intensity: 0.32, speed: 0.64, color: '#5F8D89', angle: 5 },
  },
  {
    id: 'atelier-ondes-calmes',
    name: 'Ondes calmes',
    component: 'water-ripple',
    tags: ['intermission', 'calme'],
    options: { shape: 'ellipse', frequency: 0.55, speed: 0.72, amplitude: 0.58, color: '#C8B97A', maxRadius: 210, lineWidth: 1.2 },
  },
  {
    id: 'atelier-profondeur',
    name: 'Profondeur',
    component: 'stars-parallax',
    tags: ['nuit', 'cinématique'],
    options: { density: 0.045, speed: 0.5, color: '#C8B97A' },
  },
];

const FULL = { x: 0, y: 0, width: 1, height: 1 };

/**
 * Points de départ à plusieurs couches : de quoi voir tout de suite ce qu'une pile d'effets (placements, opacités) donne.
 * Mêmes réglages d'effet que les points de départ à un effet ; ils ne sont écrits dans l'état utilisateur que par « + ».
 * @type {import('../scene-doc.js').SceneDoc[]}
 */
export const BUILTIN_BACKGROUND_SCENES = [
  {
    version: 1,
    id: 'atelier-nuit-calme',
    name: 'Nuit calme',
    tags: ['nuit', 'intermission'],
    layers: [
      { id: 'stars-parallax', kind: 'stars-parallax', visible: true, opacity: 0.9, placement: FULL, options: { density: 0.045, speed: 0.5, color: '#C8B97A' } },
      { id: 'water-ripple', kind: 'water-ripple', visible: true, opacity: 0.55, placement: { x: 0, y: 0.5, width: 1, height: 0.5 }, options: { shape: 'ellipse', frequency: 0.55, speed: 0.72, amplitude: 0.58, color: '#5F8D89', maxRadius: 210, lineWidth: 1.2 } },
    ],
  },
  {
    version: 1,
    id: 'atelier-code-de-nuit',
    name: 'Code de nuit',
    tags: ['coding', 'concentration'],
    layers: [
      { id: 'dotgrid', kind: 'dotgrid', visible: true, opacity: 0.55, placement: FULL, options: { mode: 'discussion', spacing: 24, dotRadius: 2, baseOpacity: 0.2, pulseSpeed: 0.55, colorA: '#C8B97A', colorB: '#5F8D89', angle: 0, glowIntensity: 0.8, reactionInterval: 90, reactionIntensity: 0.7 } },
      { id: 'rain', kind: 'rain', visible: true, opacity: 0.85, placement: FULL, options: { intensity: 0.32, speed: 0.64, color: '#5F8D89', angle: 5 } },
    ],
  },
  {
    version: 1,
    id: 'atelier-bulles-et-ondes',
    name: 'Bulles et ondes',
    tags: ['brb', 'léger'],
    layers: [
      { id: 'water-ripple', kind: 'water-ripple', visible: true, opacity: 0.6, placement: FULL, options: { shape: 'ellipse', frequency: 0.55, speed: 0.72, amplitude: 0.58, color: '#C8B97A', maxRadius: 210, lineWidth: 1.2 } },
      { id: 'bubble', kind: 'bubble', visible: true, opacity: 0.9, placement: { x: 0, y: 0.25, width: 1, height: 0.75 }, options: { count: 18, speed: 0.72, minRadius: 7, maxRadius: 24, color: '#C8B97A', burstMinTravel: 0.2, burstMaxTravel: 0.88, burstDuration: 0.42, burstScale: 1.7 } },
    ],
  },
];
