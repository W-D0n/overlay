// @ts-check
/**
 * dev/icons.js — Les pictogrammes du Studio : des SVG en trait (`currentColor`), sur une grille de 16 px, sans police
 * ni image à charger. Chaque icône est une chaîne statique — jamais construite à partir d'une saisie.
 */

const PATHS = {
  eye: '<path d="M1.5 8s2.3-4.5 6.5-4.5S14.5 8 14.5 8s-2.3 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
  'eye-off': '<path d="M2.5 2.5l11 11"/><path d="M6.4 4a6.6 6.6 0 0 1 1.6-.5c4.2 0 6.5 4.5 6.5 4.5a11 11 0 0 1-2 2.6M4.2 5.7A10.5 10.5 0 0 0 1.5 8s2.3 4.5 6.5 4.5c1 0 1.9-.3 2.7-.7"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  unlock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.6-1.3"/>',
  solo: '<circle cx="8" cy="8" r="2.2"/><circle cx="8" cy="8" r="5.5"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>',
  trash: '<path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.6 8.5h6.8l.6-8.5"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  undo: '<path d="M5 3L2 6l3 3"/><path d="M2 6h6.5a4 4 0 0 1 0 8H6"/>',
  redo: '<path d="M11 3l3 3-3 3"/><path d="M14 6H7.5a4 4 0 0 0 0 8H10"/>',
  grip: '<circle cx="6" cy="4" r=".9"/><circle cx="10" cy="4" r=".9"/><circle cx="6" cy="8" r=".9"/><circle cx="10" cy="8" r=".9"/><circle cx="6" cy="12" r=".9"/><circle cx="10" cy="12" r=".9"/>',
  type: '<path d="M3 4V3h10v1M8 3v10M6 13h4"/>',
  'arrow-up': '<path d="M8 13V3M4 7l4-4 4 4"/>',
  'arrow-down': '<path d="M8 3v10M4 9l4 4 4-4"/>',
};

/** @typedef {keyof typeof PATHS} IconName */

/**
 * Le SVG d'une icône.
 * @param {IconName} name
 * @returns {string}
 */
export function icon(name) {
  const filled = name === 'grip';
  return `<svg class="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="${filled ? 'currentColor' : 'none'}" stroke="${filled ? 'none' : 'currentColor'}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`;
}

export const ICON_NAMES = /** @type {IconName[]} */ (Object.keys(PATHS));
