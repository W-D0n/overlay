// @ts-check

/**
 * Sélection éditoriale prête à appliquer depuis le Studio. Ces presets ne sont jamais écrits dans
 * l'état utilisateur tant que l'on ne choisit pas « Ajouter à mes presets ».
 * @type {import('./background-state-format.js').BackgroundPreset[]}
 */
export const BUILTIN_BACKGROUND_PRESETS = [
  {
    id: 'atelier-respiration',
    name: 'Atelier — Respiration',
    component: 'DotGridBackground',
    tags: ['calme', 'discussion'],
    options: { mode: 'discussion', spacing: 24, dotRadius: 2, baseOpacity: 0.2, pulseSpeed: 0.55, colorA: '#C8B97A', colorB: '#5F8D89', angle: 0, glowIntensity: 0.8, reactionInterval: 90, reactionIntensity: 0.7 },
  },
  {
    id: 'atelier-ascension',
    name: 'Atelier — Ascension',
    component: 'BubbleBackground',
    tags: ['brb', 'léger'],
    options: { count: 18, speed: 0.72, minRadius: 7, maxRadius: 24, color: '#C8B97A', burstMinTravel: 0.2, burstMaxTravel: 0.88, burstDuration: 0.42, burstScale: 1.7 },
  },
  {
    id: 'atelier-horizon-neon',
    name: 'Atelier — Horizon néon',
    component: 'MatrixGridBackground',
    tags: ['gaming', 'énergie'],
    options: { color: '#C8B97A', backgroundOpacity: 1, speed: 0.62, gridSize: 112, lineWidth: 1.25, opacity: 0.58, glow: 0.28, horizon: 0.48, vanishingX: 0.5, perspective: 1.45, fade: 0.04 },
  },
  {
    id: 'atelier-pluie-lente',
    name: 'Atelier — Pluie lente',
    component: 'RainBackground',
    tags: ['coding', 'concentration'],
    options: { intensity: 0.32, speed: 0.64, color: '#5F8D89', angle: 5 },
  },
  {
    id: 'atelier-ondes-calmes',
    name: 'Atelier — Ondes calmes',
    component: 'WaterRippleBackground',
    tags: ['intermission', 'calme'],
    options: { shape: 'ellipse', frequency: 0.55, speed: 0.72, amplitude: 0.58, color: '#C8B97A', maxRadius: 210, lineWidth: 1.2 },
  },
  {
    id: 'atelier-profondeur',
    name: 'Atelier — Profondeur',
    component: 'StarsParallaxBackground',
    tags: ['nuit', 'cinématique'],
    options: { density: 0.045, speed: 0.5, color: '#C8B97A' },
  },
];
