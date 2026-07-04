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
      // Nom + message d'attente + sujet du jour. Reste en HTML statique (S8) : la couche `links`
      // est imbriquée à l'intérieur (contrainte de centrage flex), et les composants s'ajoutent
      // toujours en fin de conteneur (appendChild) — componentiser tag/name/rule ici les ferait
      // apparaître APRÈS les liens au lieu d'avant. Pas de solution propre sans un mécanisme
      // d'ordre d'insertion explicite (hors scope, aucun besoin concret ne le justifie).
      name: 'message',
      components: [],
      visibility: { full: true, minimal: true, hidden: false },
    },
    {
      // Liens sociaux (S8 : TextList déclaratif, remplace le rendu manuel dans starting.wire.js)
      name: 'links',
      components: [
        { component: 'TextList', options: { lines: { $bind: 'socialLinks' }, itemClass: 'starting-link-item' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
  ],
};
