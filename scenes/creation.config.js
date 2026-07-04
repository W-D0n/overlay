// @ts-check
/**
 * creation.config.js — Config de la scène Création 3D / Dessin (logique seule).
 * Le placement/DOM vit dans le template HTML + CSS (AD-2).
 * Ne porte que la variante A (capture + colonne widgets) de l'ancien Creation3D.html —
 * la variante B (panneau référence, pilotée par ?mode=B sur une 2e Browser Source) n'a
 * plus de sens en page-unique (une seule Browser Source) ; abandonnée, voir docs/inbox.md.
 * @type {import('../types.js').SceneConfig}
 */
export const sceneConfig = {
  id: 'creation',
  dotgridMode: 'creation',
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
      // Zone de capture logiciel (placeholder visuel — OBS superpose la vraie source)
      name: 'capture-zone',
      components: [{ component: 'Box', options: {} }], // S8 : remplace .creation-capture-zone
      visibility: { full: true, minimal: false, hidden: false },
      placement: { x: 40, y: 40, width: 1360, height: 992 },
    },
    {
      // Cam mini + nom
      name: 'cam-mini',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Outil actif (nom, détail, app)
      name: 'tool',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      name: 'pomodoro',
      components: [
        { component: 'PomodoroBar', options: {} },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
  ],
};
