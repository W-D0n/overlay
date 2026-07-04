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
      // Cam gauche (D0n) + cam droite (invité) — placeholders visuels. Couche composite (3 enfants
      // indépendamment positionnés en CSS) — hors scope migration S8, voir docs/specs/scene-definition-v2.md.
      name: 'cams',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Fiches nom D0n + invité — couche composite (2 cartes), même exclusion que `cams`.
      name: 'fiches',
      components: [],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // Sujet de l'interview (S8 : label+divider en composants, texte dynamique via interview.wire.js)
      name: 'subject',
      components: [
        { component: 'TextLabel', options: { text: 'Sujet', className: 'int-subject-label', tag: 'span' } },
        { component: 'Divider', options: { className: 'int-subject-v' } },
        { component: 'TextLabel', options: { text: '—', className: 'int-subject-text subject-text', tag: 'span' } },
      ],
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
