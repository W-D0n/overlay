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
      components: [{ component: 'Box', options: {} }], // S8 : remplace .react-source-zone
      visibility: { full: true, minimal: false, hidden: false },
      placement: { x: 40, y: 40, width: 1060, height: 800 },
    },
    {
      // Crédit source (titre + auteur + plateforme) (S8 : label+divider en composants, valeurs
      // dynamiques toujours via react.wire.js)
      name: 'source-credit',
      components: [
        { component: 'TextLabel', options: { text: 'Source', className: 'react-credit-label', tag: 'span' } },
        { component: 'Divider', options: { className: 'react-credit-v' } },
        { component: 'TextLabel', options: { text: '—', className: 'react-credit-title', tag: 'span' } },
        { component: 'TextLabel', options: { text: '', className: 'react-credit-platform', tag: 'span' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
      placement: { x: 40, y: 858, width: 1060, height: 76 },
    },
    {
      // Cam réaction (placeholder)
      name: 'cam',
      components: [{ component: 'Box', options: {} }], // S8 : remplace .react-cam
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
      // HUD bas : durée — contient un wrapper imbriqué (.react-hud-pair, label+valeur groupés),
      // pas trivialement aplatissable avec des composants leaf-only. Hors scope migration S8.
      name: 'hud',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
  ],
};
