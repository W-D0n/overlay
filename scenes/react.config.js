// @ts-check
/**
 * react.config.js — Config de la scène React à des vidéos (logique seule).
 * Le placement/DOM vit dans le template HTML + CSS (AD-2).
 * @type {import('../types.js').SceneConfig}
 */
export const sceneConfig = {
  id: 'react',
  dotgridMode: 'react',
  transition: { type: 'crossfade', duration: 400, easing: 'easeInOut' },
  layers: [
    {
      name: 'goldbar',
      components: [
        { component: 'GoldBar', options: { position: 'top' } },
        { component: 'GoldBar', options: { position: 'bottom' } },
      ],
      visibility: { full: true, minimal: true, hidden: false },
    },
    {
      // Zone vidéo source (placeholder visuel — OBS superpose la vraie source)
      name: 'source-zone',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
      placement: { x: 40, y: 40, width: 1060, height: 800 },
    },
    {
      // Crédit source (titre + auteur + plateforme)
      name: 'source-credit',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
      placement: { x: 40, y: 858, width: 1060, height: 76 },
    },
    {
      // Cam réaction (placeholder)
      name: 'cam',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
      placement: { x: 1168, y: 40, width: 712, height: 460 },
    },
    {
      name: 'chat',
      components: [
        { component: 'ChatFeed', options: { maxMessages: 12, fontSize: '20px' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // HUD bas : durée
      name: 'hud',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
  ],
};
