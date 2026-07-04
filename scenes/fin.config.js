// @ts-check
/**
 * fin.config.js — Config de la scène Fin de stream (logique seule).
 * Le placement/DOM vit dans le template HTML + CSS (AD-2).
 * Note : barre dorée basse à pleine opacité (0.8) — seule scène où c'est le cas ;
 * rendue en markup statique dans le template (pas via GoldBar, dont l'opacité bottom
 * par défaut est 0.3) plutôt que d'étendre l'API du composant pour ce cas unique.
 * @type {import('../types.js').SceneConfig}
 */
export const sceneConfig = {
  id: 'fin',
  dotgridMode: 'fin',
  transition: { type: 'crossfade', duration: 500, easing: 'easeInOut' },
  layers: [
    {
      name: 'goldbar',
      components: [
        { component: 'GoldBar', options: { position: 'top' } },
      ],
      visibility: { full: true, minimal: true, hidden: false },
    },
    {
      // Cam grande gauche (placeholder)
      name: 'cam',
      components: [{ component: 'Box', options: {} }], // S8 : remplace .fin-cam
      visibility: { full: true, minimal: false, hidden: false },
      placement: { x: 40, y: 40, width: 800, height: 992 },
    },
    {
      // Récap de session (S8 : TextList déclaratif, remplace le rendu manuel dans fin.wire.js)
      name: 'recap',
      components: [
        { component: 'TextList', options: { lines: { $bind: 'recapLines' }, itemClass: 'fin-recap-line' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Prochain stream
      name: 'next-stream',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      name: 'stats',
      components: [
        { component: 'StatBlock', options: { label: 'NOUVEAUX FOLLOWS', value: '—', valueColor: '#C8B97A' } },
        { component: 'StatBlock', options: { label: 'DURÉE', value: '00:00:00' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Liens sociaux (S8 : TextList déclaratif)
      name: 'links',
      components: [
        { component: 'TextList', options: { lines: { $bind: 'socialLinks' }, itemClass: 'fin-link-item' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
  ],
};
