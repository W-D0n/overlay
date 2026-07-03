// @ts-check
/**
 * discussion.config.js — Config de la scène Discussion (logique seule).
 * Le placement/DOM vit dans le template HTML + CSS (AD-2).
 * @type {import('../types.js').SceneConfig}
 */
export const sceneConfig = {
  id: 'discussion',
  dotgridMode: 'discussion',
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
      name: 'cam',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      name: 'subject',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      name: 'stats',
      components: [
        { component: 'StatBlock', options: { label: 'DURÉE', value: '00:00:00', valueColor: '#C8B97A' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      name: 'chat',
      components: [
        { component: 'ChatFeed', options: { maxMessages: 7, fontSize: '22px' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      name: 'last-follow',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      name: 'alert',
      components: [
        { component: 'AlertBanner', options: { displayDuration: 5000 } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
  ],
};
