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

  {
    version: 1,
    id: 'atelier-debut-de-live',
    name: 'Début de live',
    tags: ['starting', 'titre'],
    layers: [
      { id: 'stars-parallax', kind: 'stars-parallax', visible: true, opacity: 0.9, placement: FULL, options: { density: 0.045, speed: 0.5, color: '#C8B97A' } },
      { id: 'titre', name: 'Titre', kind: 'text', visible: true, opacity: 1, placement: { x: 0.1, y: 0.3, width: 0.8, height: 0.24 }, options: { text: ['Début de live'], font: 'serif', fontSize: 150, bold: true, color: '#F2F0EC', shadowBlur: 24, shadowOffsetY: 6, shadowColor: '#000000' } },
      { id: 'filet', name: 'Filet', kind: 'shape', visible: true, opacity: 1, placement: { x: 0.35, y: 0.56, width: 0.3, height: 0.012 }, options: { shape: 'line', strokeWidth: 3, strokeColor: '#C8B97A' } },
      { id: 'sous-titre', name: 'Sous-titre', kind: 'text', visible: true, opacity: 1, placement: { x: 0.2, y: 0.6, width: 0.6, height: 0.08 }, options: { text: ['Dans quelques instants'], font: 'sans', fontSize: 46, bold: false, uppercase: true, letterSpacing: 10, color: '#C8B97A' } },
    ],
  },
  {
    version: 1,
    id: 'atelier-je-reviens',
    name: 'Je reviens',
    tags: ['brb', 'pause', 'titre'],
    layers: [
      { id: 'water-ripple', kind: 'water-ripple', visible: true, opacity: 0.6, placement: FULL, options: { shape: 'ellipse', frequency: 0.55, speed: 0.72, amplitude: 0.58, color: '#C8B97A', maxRadius: 210, lineWidth: 1.2 } },
      { id: 'panneau', name: 'Panneau', kind: 'shape', visible: true, opacity: 0.72, placement: { x: 0.25, y: 0.36, width: 0.5, height: 0.28 }, options: { shape: 'rectangle', fill: 'gradient', color: '#17171C', color2: '#0A0A0B', gradientAngle: 90, cornerRadius: 24, strokeWidth: 2, strokeColor: '#C8B97A', shadowBlur: 30, shadowOffsetY: 10, shadowColor: '#000000' } },
      { id: 'message', name: 'Message', kind: 'text', visible: true, opacity: 1, placement: { x: 0.27, y: 0.38, width: 0.46, height: 0.24 }, options: { text: ['Je reviens', 'dans un instant'], font: 'serif', fontSize: 96, bold: true, color: '#F2F0EC', lineHeight: 1.25 } },
    ],
  },
  {
    version: 1,
    id: 'atelier-fin-de-live',
    name: 'Fin de live',
    tags: ['fin', 'merci', 'titre'],
    layers: [
      { id: 'dotgrid', kind: 'dotgrid', visible: true, opacity: 0.5, placement: FULL, options: { mode: 'fin', spacing: 24, dotRadius: 2, baseOpacity: 0.2, pulseSpeed: 0.4, colorA: '#C8B97A', colorB: '#5F8D89', angle: 0, glowIntensity: 0.8, reactionInterval: 90, reactionIntensity: 0.7 } },
      { id: 'merci', name: 'Merci', kind: 'text', visible: true, opacity: 1, placement: { x: 0.1, y: 0.34, width: 0.8, height: 0.2 }, options: { text: ['Merci d’être passé'], font: 'serif', fontSize: 130, bold: true, italic: true, color: '#F2F0EC', shadowBlur: 20, shadowOffsetY: 5, shadowColor: '#000000' } },
      { id: 'a-bientot', name: 'À bientôt', kind: 'text', visible: true, opacity: 1, placement: { x: 0.2, y: 0.56, width: 0.6, height: 0.07 }, options: { text: ['À bientôt'], font: 'sans', fontSize: 44, bold: false, uppercase: true, letterSpacing: 12, color: '#C8B97A' } },
    ],
  },
];
