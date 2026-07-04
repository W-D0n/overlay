// @ts-check
/**
 * dev/component-field-schemas.js — Schémas de champs éditables par type de composant (S8 session 5/6).
 *
 * Configuration statique pilotant le formulaire de `placement-panel.html` — aucune logique ici
 * (pattern "configuration hors composant", CLAUDE.md). Un schéma par type composable, reflétant
 * exactement la signature de sa factory (`components/index.js`). `DotGridBackground` est exclu :
 * singleton du fond de page, jamais monté dans une couche de scène (voir scene-runtime.js).
 *
 * `type` :
 *   - 'text'     : input texte
 *   - 'number'   : input numérique
 *   - 'select'   : liste déroulante (`choices`)
 *   - 'textarea' : une ligne par élément d'un tableau de chaînes (ex : `TextList.lines`)
 *
 * @typedef {Object} FieldSchema
 * @property {string} key - Clé dans `ComponentMount.options`
 * @property {string} label - Libellé affiché
 * @property {'text'|'number'|'select'|'textarea'} type
 * @property {string[]} [choices] - Valeurs possibles si `type === 'select'`
 * @property {unknown} default - Valeur par défaut à l'ajout du composant
 */

/** @type {Record<string, FieldSchema[]>} */
export const COMPONENT_FIELD_SCHEMAS = {
  GoldBar: [
    { key: 'position', label: 'Position', type: 'select', choices: ['top', 'bottom'], default: 'top' },
    { key: 'opacity', label: 'Opacité', type: 'number', default: 1 },
  ],
  StatBlock: [
    { key: 'label', label: 'Libellé', type: 'text', default: 'LABEL' },
    { key: 'value', label: 'Valeur', type: 'text', default: '—' },
    { key: 'valueColor', label: 'Couleur de la valeur', type: 'text', default: '#F2F0EC' },
    { key: 'minWidth', label: 'Largeur minimale', type: 'text', default: 'auto' },
  ],
  ChatFeed: [
    { key: 'maxMessages', label: 'Messages max', type: 'number', default: 8 },
    { key: 'fontSize', label: 'Taille de police', type: 'text', default: '8px' },
  ],
  PomodoroBar: [],
  AlertBanner: [
    { key: 'displayDuration', label: "Durée d'affichage (ms)", type: 'number', default: 5000 },
  ],
  Box: [
    { key: 'borderRadius', label: 'Rayon de bordure', type: 'text', default: 'var(--radius-md)' },
    { key: 'borderColor', label: 'Bordure', type: 'text', default: 'var(--border-panel)' },
    { key: 'background', label: 'Fond', type: 'text', default: 'var(--color-bg-panel)' },
    { key: 'className', label: 'Classe CSS (optionnel)', type: 'text', default: '' },
  ],
  Divider: [
    { key: 'orientation', label: 'Orientation', type: 'select', choices: ['horizontal', 'vertical'], default: 'horizontal' },
    { key: 'thickness', label: 'Épaisseur', type: 'text', default: '1px' },
    { key: 'color', label: 'Couleur', type: 'text', default: 'var(--color-rule)' },
    { key: 'className', label: 'Classe CSS (optionnel)', type: 'text', default: '' },
  ],
  TextLabel: [
    { key: 'text', label: 'Texte', type: 'text', default: '' },
    { key: 'font', label: 'Police', type: 'select', choices: ['serif', 'mono'], default: 'serif' },
    { key: 'size', label: 'Taille', type: 'text', default: '16px' },
    { key: 'color', label: 'Couleur', type: 'text', default: 'var(--color-text-primary)' },
    { key: 'weight', label: 'Graisse', type: 'text', default: '400' },
    { key: 'className', label: 'Classe CSS (optionnel)', type: 'text', default: '' },
    { key: 'tag', label: 'Balise HTML', type: 'text', default: 'div' },
  ],
  TextList: [
    { key: 'lines', label: 'Lignes (une par ligne)', type: 'textarea', default: [] },
    { key: 'itemClass', label: 'Classe CSS par ligne', type: 'text', default: '' },
  ],
  PollBar: [
    { key: 'question', label: 'Question', type: 'text', default: '' },
    { key: 'yesRatio', label: 'Ratio "oui" (0-1)', type: 'number', default: 0 },
  ],
  Badge: [
    { key: 'text', label: 'Texte', type: 'text', default: '' },
    { key: 'color', label: 'Couleur de fond', type: 'text', default: 'var(--color-gold)' },
  ],
  Image: [
    { key: 'src', label: 'Chemin asset local', type: 'text', default: '' },
    { key: 'width', label: 'Largeur (optionnel)', type: 'text', default: '' },
    { key: 'height', label: 'Hauteur (optionnel)', type: 'text', default: '' },
  ],
};

/** Types composables proposés par le sélecteur d'ajout — `DotGridBackground` exclu (singleton). */
export const COMPOSABLE_COMPONENT_NAMES = Object.keys(COMPONENT_FIELD_SCHEMAS);
