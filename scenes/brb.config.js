// @ts-check
/**
 * brb.config.js — Config de la scène BRB / Pause (logique seule).
 * Note : la couche `message` survit au niveau minimal — la raison d'être de BRB
 * est d'indiquer la pause ; goldbar seul ne suffit pas.
 * @type {import('../types.js').SceneConfig}
 */
export const sceneConfig = {
  id: 'brb',
  dotgridMode: 'brb',
  transition: { type: 'crossfade', duration: 600, easing: 'easeInOut' },
  layers: [
    {
      name: 'goldbar',
      components: [
        { component: 'GoldBar', options: { position: 'top', opacity: 0.6 } },
        { component: 'GoldBar', options: { position: 'bottom' } },
      ],
      visibility: { full: true, minimal: true, hidden: false },
    },
    {
      // Bloc gauche : message de pause + activité + musique
      name: 'message',
      components: [],
      visibility: { full: true, minimal: true, hidden: false },
    },
    {
      // Bloc droit : chat live
      name: 'chat',
      components: [
        { component: 'ChatFeed', options: { maxMessages: 10, fontSize: '20px' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Stats viewers + durée
      name: 'stats',
      components: [
        { component: 'StatBlock', options: { label: 'DURÉE', value: '00:00:00', valueColor: '#C8B97A' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Bande basse : prochain stream
      name: 'next-stream',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
  ],
};
