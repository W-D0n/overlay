// @ts-check
/**
 * discussion.config.js — Config de la scène Discussion (logique seule).
 * Le placement/DOM vit dans le template HTML + CSS (AD-2), sauf la couche `cam` — migrée vers
 * `Placement` (S7 session 2/5, docs/specs/scene-placement-protocol.md, scène de référence).
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
      components: [{ component: 'Box', options: {} }], // S8 : remplace .disc-cam
      visibility: { full: true, minimal: false, hidden: false },
      placement: { x: 40, y: 40, width: 1080, height: 960 },
    },
    {
      // S8 : contenu statique en composants (className = CSS existant, marges/police préservées).
      // subject-text reste géré par discussion.wire.js (fallback 'En attente' non exprimable en $bind pur).
      name: 'subject',
      components: [
        { component: 'TextLabel', options: { text: 'D0n', className: 'disc-name', tag: 'h1' } },
        { component: 'Divider', options: { className: 'disc-rule-gold' } },
        { component: 'TextLabel', options: { text: 'Sujet du moment', className: 'disc-label', tag: 'span' } },
        { component: 'TextLabel', options: { text: 'En attente', className: 'subject-text' } },
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
    {
      name: 'chat',
      components: [
        { component: 'ChatFeed', options: { maxMessages: 7, fontSize: '22px' } },
      ],
      visibility: { full: true, minimal: false, hidden: false },
    },
    {
      // S8 : idem, last-follow-name reste géré par discussion.wire.js (conditionnel sur type follow).
      name: 'last-follow',
      components: [
        { component: 'TextLabel', options: { text: 'Dernier follow', className: 'disc-label', tag: 'span' } },
        { component: 'TextLabel', options: { text: '—', className: 'last-follow-name' } },
        { component: 'TextLabel', options: { text: 'twitch.tv/d0natelll0', className: 'disc-footer' } },
      ],
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
