// @ts-check
/**
 * interview.config.js — Config de la scène Interview / Invité (logique seule).
 * Le placement/DOM vit dans le template HTML + CSS (AD-2).
 * @type {import('../types.js').SceneConfig}
 */
export const sceneConfig = {
  id: 'interview',
  dotgridMode: 'interview',
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
      // Cam gauche (D0n) + cam droite (invité) — placeholders visuels
      name: 'cams',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Fiches nom D0n + invité
      name: 'fiches',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Sujet de l'interview
      name: 'subject',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
      placement: { x: 40, y: 1000, width: 1520, height: 60 },
    },
    {
      // Colonne chat + stats durée
      name: 'chat',
      components: [
        { component: 'ChatFeed', options: { maxMessages: 10, fontSize: '18px' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      name: 'stats',
      components: [
        { component: 'StatBlock', options: { label: 'DURÉE', value: '00:00:00', valueColor: '#C8B97A' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
  ],
};
