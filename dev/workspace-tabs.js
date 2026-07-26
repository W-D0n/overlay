// @ts-check
/**
 * dev/workspace-tabs.js — Bascule entre les espaces de travail du tuner.
 *
 * Le panneau portait ses sept sections dépliées dans une seule colonne : 5,4 écrans de défilement
 * pour atteindre un réglage (mesuré le 2026-07-26). Les sections sont regroupées en trois espaces,
 * un seul visible à la fois.
 */

/**
 * Décide ce qui doit être visible. Pur : la logique de sélection se teste sans DOM.
 * @param {string[]} available - Espaces déclarés, dans l'ordre
 * @param {string | null} requested - Espace demandé (bouton cliqué, réglage relu)
 * @returns {string} L'espace à afficher — le premier déclaré si la demande n'existe pas
 */
export function resolveWorkspace(available, requested) {
  if (available.length === 0) return '';
  return requested !== null && available.includes(requested) ? requested : available[0];
}

/**
 * @param {{
 *   nav: HTMLElement,
 *   panels: HTMLElement[],
 *   storage?: Pick<Storage, 'getItem' | 'setItem'>,
 * }} input
 */
export function createWorkspaceTabs(input) {
  const STORAGE_KEY = 'overlay-tuner-workspace';
  const buttons = /** @type {HTMLButtonElement[]} */ ([...input.nav.querySelectorAll('[data-workspace]')]);
  const available = buttons.map((button) => button.dataset.workspace ?? '');

  function show(requested) {
    const active = resolveWorkspace(available, requested);
    for (const button of buttons) {
      button.setAttribute('aria-selected', String(button.dataset.workspace === active));
    }
    for (const panel of input.panels) {
      panel.hidden = panel.dataset.workspace !== active;
    }
    // Revenir dans un espace après un aller-retour doit retrouver le haut de la section, pas la
    // position de défilement de l'espace précédent.
    input.nav.parentElement?.scrollTo({ top: 0 });
    try {
      input.storage?.setItem(STORAGE_KEY, active);
    } catch {
      // Stockage indisponible (mode privé, iframe restreinte) : la bascule marche quand même,
      // seule la mémoire entre deux ouvertures est perdue.
    }
    return active;
  }

  for (const button of buttons) {
    button.onclick = () => show(button.dataset.workspace ?? null);
  }

  let remembered = null;
  try {
    remembered = input.storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    remembered = null;
  }
  show(remembered);

  return { show };
}
