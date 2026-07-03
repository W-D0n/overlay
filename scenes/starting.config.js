// @ts-check
/**
 * starting.config.js — Config de la scène Démarrage (écran d'attente pré-live, logique seule).
 * Le placement/DOM vit dans le template HTML + CSS (AD-2).
 * @type {import('../types.js').SceneConfig}
 */
export const sceneConfig = {
  id: 'starting',
  dotgridMode: 'starting',
  transition: { type: 'crossfade', duration: 500, easing: 'easeInOut' },
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
      // Nom + message d'attente + sujet du jour
      name: 'message',
      components: [],
      visibility: { full: true, minimal: true, hidden: false },
    },
    {
      // Liens sociaux
      name: 'links',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
  ],
};
