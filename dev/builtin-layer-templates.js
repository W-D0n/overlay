// @ts-check
/**
 * dev/builtin-layer-templates.js — The library of ready-made layer templates shipped with the Studio: titles, banners, alert panels, a neon title. They are inserted like
 * the templates the owner saves (one history step), never written to the settings until "Copier dans mes modèles" is chosen. Data only: each template is a valid list of
 * layers (groups included), checked by `builtin-layer-templates.test.js` against the scene document rules.
 *
 * @typedef {import('../src/scene/scene-doc.js').Layer} Layer
 * @typedef {{ id: string, name: string, category: string, description: string, layers: Layer[] }} LibraryTemplate
 */
import { deriveGroupPlacements } from '../src/layers/layer-group.js';

export const LIBRARY_PREFIX = 'lib.';

const GOLD = '#C8B97A';
const TEAL = '#5F8D89';
const IVORY = '#F2F0EC';
const INK = '#17171C';
const FULL = { x: 0, y: 0, width: 1, height: 1 };

/** @param {string} id @param {string} name @param {Layer['placement']} placement @param {object} options @param {object} [extra] @returns {Layer} */
const text = (id, name, placement, options, extra = {}) => /** @type {Layer} */ ({ id, name, kind: 'text', visible: true, opacity: 1, placement, options, ...extra });
/** @param {string} id @param {string} name @param {Layer['placement']} placement @param {object} options @param {object} [extra] @returns {Layer} */
const shape = (id, name, placement, options, extra = {}) => /** @type {Layer} */ ({ id, name, kind: 'shape', visible: true, opacity: 1, placement, options, ...extra });

/**
 * A group and its members, in the order of a scene: the members, then the group (whose box is derived from them).
 * @param {string} id @param {string} name @param {Layer[]} members @param {object} [extra] the look and animation of the group
 * @returns {Layer[]}
 */
function grouped(id, name, members, extra = {}) {
  const group = /** @type {Layer} */ ({ id, name, kind: 'group', visible: true, opacity: 1, placement: FULL, options: {}, ...extra });
  return deriveGroupPlacements([...members.map((member) => ({ ...member, group: id })), group]);
}

/** @type {readonly LibraryTemplate[]} */
export const LIBRARY_TEMPLATES = Object.freeze([
  {
    id: 'lib.titre-sous-titre',
    name: 'Titre et sous-titre',
    category: 'Titres',
    description: 'Un titre serif, un filet doré et une ligne en capitales, qui arrivent l’un après l’autre.',
    layers: grouped('titre-sous-titre', 'Titre et sous-titre', [
      text('titre', 'Titre', { x: 0.1, y: 0.36, width: 0.8, height: 0.2 }, { text: ['Votre titre'], font: 'serif', fontSize: 140, bold: true, color: IVORY, shadowBlur: 24, shadowOffsetY: 6, shadowColor: '#000000' }, { animation: { enter: { preset: 'slide-bottom', durationMs: 700 } } }),
      shape('filet', 'Filet', { x: 0.35, y: 0.58, width: 0.3, height: 0.012 }, { shape: 'line', strokeWidth: 3, strokeColor: GOLD }, { animation: { enter: { preset: 'wipe-right', durationMs: 600, delayMs: 500 } } }),
      text('sous-titre', 'Sous-titre', { x: 0.2, y: 0.62, width: 0.6, height: 0.08 }, { text: ['Votre sous-titre'], font: 'sans', fontSize: 44, uppercase: true, letterSpacing: 10, color: GOLD }, { animation: { enter: { preset: 'fade', durationMs: 700, delayMs: 900 } } }),
    ]),
  },
  {
    id: 'lib.bandeau-identite',
    name: 'Bandeau d’identité',
    category: 'Bandeaux',
    description: 'Un bandeau en bas à gauche avec un nom et un rôle, qui glisse depuis la gauche.',
    layers: grouped('bandeau-identite', 'Bandeau d’identité', [
      shape('fond', 'Fond', { x: 0.04, y: 0.84, width: 0.3, height: 0.11 }, { shape: 'rectangle', fill: 'gradient', color: INK, color2: '#0A0A0B', gradientAngle: 90, cornerRadius: 14, strokeWidth: 2, strokeColor: GOLD, shadowBlur: 20, shadowOffsetY: 6, shadowColor: '#000000' }, { opacity: 0.9 }),
      text('nom', 'Nom', { x: 0.055, y: 0.855, width: 0.27, height: 0.05 }, { text: ['Votre nom'], font: 'serif', fontSize: 52, bold: true, color: IVORY, horizontalAlign: 'left' }),
      text('role', 'Rôle', { x: 0.055, y: 0.905, width: 0.27, height: 0.03 }, { text: ['Votre rôle'], font: 'sans', fontSize: 28, uppercase: true, letterSpacing: 6, color: GOLD, horizontalAlign: 'left' }),
    ], { animation: { enter: { preset: 'slide-left', durationMs: 800 } } }),
  },
  {
    id: 'lib.alerte-follow',
    name: 'Alerte follow',
    category: 'Alertes',
    description: 'Un panneau qui rebondit à chaque follow reçu, reste cinq secondes puis disparaît.',
    layers: grouped('alerte-follow', 'Alerte follow', [
      shape('fond', 'Fond', { x: 0.3, y: 0.08, width: 0.4, height: 0.14 }, { shape: 'rectangle', fill: 'gradient', color: INK, color2: '#0A0A0B', gradientAngle: 90, cornerRadius: 20, strokeWidth: 2, strokeColor: GOLD, shadowBlur: 24, shadowOffsetY: 8, shadowColor: '#000000' }),
      text('titre', 'Titre', { x: 0.32, y: 0.095, width: 0.36, height: 0.05 }, { text: ['Nouveau follow'], font: 'sans', fontSize: 34, uppercase: true, letterSpacing: 8, color: GOLD }),
      text('pseudo', 'Pseudo', { x: 0.32, y: 0.15, width: 0.36, height: 0.06 }, { text: ['Pseudo'], font: 'serif', fontSize: 64, bold: true, color: IVORY }),
    ], { animation: { enter: { preset: 'bounce', durationMs: 900 }, exit: { preset: 'fade', durationMs: 600, afterMs: 5000 }, restartOn: ['event:follow'] } }),
  },
  {
    id: 'lib.alerte-raid',
    name: 'Alerte raid',
    category: 'Alertes',
    description: 'Un panneau vert d’eau qui entre en zoom à chaque raid reçu, reste huit secondes puis disparaît.',
    layers: grouped('alerte-raid', 'Alerte raid', [
      shape('fond', 'Fond', { x: 0.25, y: 0.38, width: 0.5, height: 0.24 }, { shape: 'rectangle', fill: 'gradient', color: '#1B2B2A', color2: '#0A0F0F', gradientAngle: 90, cornerRadius: 28, strokeWidth: 3, strokeColor: TEAL, shadowBlur: 30, shadowOffsetY: 10, shadowColor: '#000000' }),
      text('titre', 'Titre', { x: 0.27, y: 0.4, width: 0.46, height: 0.07 }, { text: ['Raid entrant'], font: 'sans', fontSize: 40, uppercase: true, letterSpacing: 10, color: TEAL }),
      text('pseudo', 'Pseudo', { x: 0.27, y: 0.48, width: 0.46, height: 0.12 }, { text: ['Pseudo'], font: 'serif', fontSize: 110, bold: true, color: IVORY }),
    ], { animation: { enter: { preset: 'zoom', durationMs: 800 }, exit: { preset: 'fade', durationMs: 800, afterMs: 8000 }, restartOn: ['event:raid'] } }),
  },
  {
    id: 'lib.je-reviens',
    name: 'Panneau « Je reviens »',
    category: 'Écrans d’attente',
    description: 'Un panneau arrondi au message flottant doucement, pour les pauses.',
    layers: grouped('je-reviens', 'Je reviens', [
      shape('panneau', 'Panneau', { x: 0.25, y: 0.36, width: 0.5, height: 0.28 }, { shape: 'rectangle', fill: 'gradient', color: INK, color2: '#0A0A0B', gradientAngle: 90, cornerRadius: 24, strokeWidth: 2, strokeColor: GOLD, shadowBlur: 30, shadowOffsetY: 10, shadowColor: '#000000' }, { opacity: 0.8 }),
      text('message', 'Message', { x: 0.27, y: 0.38, width: 0.46, height: 0.24 }, { text: ['Je reviens', 'dans un instant'], font: 'serif', fontSize: 96, bold: true, color: IVORY, lineHeight: 1.25 }),
    ], { animation: { enter: { preset: 'fade', durationMs: 900 }, loop: { preset: 'float', periodMs: 5000 } } }),
  },
  {
    id: 'lib.titre-neon',
    name: 'Titre néon',
    category: 'Titres',
    description: 'Un titre à lueur dorée qui pulse avec le son (liaison sur l’intensité de la lueur).',
    layers: [
      text('titre-neon', 'Titre néon', { x: 0.1, y: 0.4, width: 0.8, height: 0.2 }, { text: ['NÉON'], font: 'display', fontSize: 160, bold: true, color: IVORY },
        { filters: { glow: { color: GOLD.toLowerCase(), size: 24, intensity: 0.6 } }, bindings: [{ source: 'audio', target: 'filter:glow', from: 0.3, to: 1, durationMs: 150 }], animation: { loop: { preset: 'pulse', periodMs: 4000, amount: 0.5 } } }),
    ],
  },
  {
    id: 'lib.machine-a-ecrire',
    name: 'Phrase à la machine à écrire',
    category: 'Titres',
    description: 'Une phrase qui s’écrit lettre après lettre, avec un filet doré dessiné dessous.',
    layers: grouped('machine-a-ecrire', 'Phrase à la machine à écrire', [
      text('phrase', 'Phrase', { x: 0.15, y: 0.42, width: 0.7, height: 0.12 }, { text: ['Une phrase qui s’écrit toute seule'], font: 'mono', fontSize: 64, color: IVORY }, { animation: { enter: { preset: 'type', durationMs: 2400 } } }),
      shape('filet', 'Filet', { x: 0.15, y: 0.56, width: 0.7, height: 0.012 }, { shape: 'line', strokeWidth: 3, strokeColor: GOLD }, { animation: { enter: { preset: 'draw', durationMs: 1200, delayMs: 2400 } } }),
    ]),
  },
  {
    id: 'lib.cadre-dore',
    name: 'Cadre doré',
    category: 'Habillages',
    description: 'Un cadre fin autour de l’écran, dont le contour se dessine à l’arrivée.',
    layers: [
      shape('cadre', 'Cadre', { x: 0.015, y: 0.025, width: 0.97, height: 0.95 }, { shape: 'rectangle', fill: 'none', cornerRadius: 18, strokeWidth: 3, strokeColor: GOLD }, { opacity: 0.85, animation: { enter: { preset: 'draw', durationMs: 1800 } } }),
    ],
  },
].map((template) => Object.freeze(template)));

/**
 * The library grouped by category, in the order of first appearance.
 * @param {readonly LibraryTemplate[]} [templates]
 * @returns {{ category: string, templates: LibraryTemplate[] }[]}
 */
export function libraryByCategory(templates = LIBRARY_TEMPLATES) {
  /** @type {Map<string, LibraryTemplate[]>} */
  const byCategory = new Map();
  for (const template of templates) byCategory.set(template.category, [...(byCategory.get(template.category) ?? []), template]);
  return [...byCategory].map(([category, list]) => ({ category, templates: list }));
}

/**
 * The templates whose name, category or description contain every word of the query (accents and case ignored).
 * @param {string} query
 * @param {readonly LibraryTemplate[]} [templates]
 * @returns {LibraryTemplate[]}
 */
export function searchLibrary(query, templates = LIBRARY_TEMPLATES) {
  const fold = (/** @type {string} */ value) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const words = fold(query).split(/\s+/).filter((word) => word !== '');
  return templates.filter((template) => {
    const haystack = fold(`${template.name} ${template.category} ${template.description}`);
    return words.every((word) => haystack.includes(word));
  });
}
