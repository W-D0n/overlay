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
      // Cam mini + nom (S8 : composants, h1 sans classe propre — stylé via sélecteur descendant
      // `.creation-name-block h1`, d'où className: '' pour TextLabel)
      name: 'cam-mini',
      components: [
        { component: 'TextLabel', options: { text: 'D0n', className: '', tag: 'h1' } },
        { component: 'Box', options: { className: 'creation-cam-mini' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Outil actif (nom, détail, app) (S8 : label en composant, valeurs dynamiques via creation.wire.js)
      name: 'tool',
      components: [
        { component: 'TextLabel', options: { text: 'Outil actif', className: 'creation-label', tag: 'span' } },
        { component: 'TextLabel', options: { text: '—', className: 'creation-tool-name' } },
        { component: 'TextLabel', options: { text: '', className: 'creation-tool-detail' } },
        { component: 'TextLabel', options: { text: '', className: 'creation-tool-app' } },
      ],
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
