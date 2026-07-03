// @ts-check
/**
 * jeu.config.js — Config de la scène Jeu / session de jeu (logique seule).
 * `dotgridMode: null` : le jeu occupe le fond (capture OBS derrière) — aucun DotGrid,
 * `#bg-layer` masqué (AC-22, premier cas réel du chemin `setMode(null)` jamais appelé).
 * HUD bas DOM-pur câblé par le wire ; seule la goldbar monte un composant.
 * Couche `cam` migrée vers `Placement` (S7 session 2/5, scène de référence) ; `hud` reste en CSS
 * (bande pleine largeur `left:0;right:0`, pas exprimable en `Placement` pixels absolus — hors scope).
 * @type {import('../types.js').SceneConfig}
 */
export const sceneConfig = {
  id: 'jeu',
  dotgridMode: null,
  transition: { type: 'crossfade', duration: 400, easing: 'easeInOut' },
  layers: [
    {
      name: 'goldbar',
      components: [
        { component: 'GoldBar', options: { position: 'top', opacity: 0.6 } },
      ],
      visibility: { full: true, minimal: true, hidden: false },
    },
    {
      // Cam mini coin haut-gauche (décoration DOM pure)
      name: 'cam',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
      placement: { x: 28, y: 28, width: 300, height: 200 },
    },
    {
      // Barre HUD basse : session, durée, viewers, vote, alerte (DOM pur, câblé par le wire)
      name: 'hud',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
  ],
};
