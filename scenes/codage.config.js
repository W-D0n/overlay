// @ts-check
/**
 * codage.config.js — Config de la scène Codage (logique seule).
 * Le placement/DOM vit dans le template HTML + CSS (AD-2).
 * @type {import('../types.js').SceneConfig}
 */
export const sceneConfig = {
  id: 'codage',
  dotgridMode: 'codage',
  transition: { type: 'crossfade', duration: 300, easing: 'easeInOut' },
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
      // Zone de capture IDE (placeholder visuel — OBS superpose la vraie source)
      name: 'ide-zone',
      components: [{ component: 'Box', options: {} }], // S8 : remplace .cod-capture
      visibility: { full: true, minimal: false, hidden: false },
      placement: { x: 40, y: 40, width: 1360, height: 992 },
    },
    {
      // Cam mini (placeholder)
      name: 'cam-mini',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Contexte IDE : fichier actif, branche git, stack (S8 : label en composant, valeurs dynamiques
      // toujours gérées par codage.wire.js — querySelector par className, transparent au wire).
      name: 'ide-context',
      components: [
        { component: 'TextLabel', options: { text: 'Fichier actif', className: 'cod-label', tag: 'span' } },
        { component: 'TextLabel', options: { text: '—', className: 'file-name' } },
        { component: 'TextLabel', options: { text: '', className: 'git-branch' } },
        { component: 'TextLabel', options: { text: '', className: 'stack-info' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Timer pomodoro
      name: 'pomodoro',
      components: [
        { component: 'PomodoroBar', options: {} },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Durée
      name: 'stats',
      components: [
        { component: 'StatBlock', options: { label: 'DURÉE', value: '00:00:00', valueColor: '#C8B97A' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Alerte plein écran + bande basse texte
      name: 'alert',
      components: [
        { component: 'AlertBanner', options: {} },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
  ],
};
