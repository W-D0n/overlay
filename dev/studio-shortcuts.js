// @ts-check
/**
 * dev/studio-shortcuts.js — Les raccourcis clavier globaux du Studio : chaque événement clavier est confronté au registre de
 * commandes ; la commande liée, si elle est disponible, s'exécute.
 *
 * Règles de bon voisinage : dans un champ de saisie, les gestes d'édition du texte (Ctrl+C/X/V/A/Z/Y) et les touches seules
 * restent au champ ; seules les combinaisons à Ctrl d'un autre ordre (palette, publier…) passent. Une fenêtre modale
 * ouverte garde le clavier, sauf la palette elle-même. Une commande indisponible laisse l'événement au navigateur
 * (Ctrl+V sans rien de copié n'est pas avalé).
 */

/** Gestes d'édition de texte que le champ de saisie garde pour lui. */
const TEXT_EDITING_KEYS = new Set(['c', 'x', 'v', 'a', 'z', 'y']);

/** @param {EventTarget | null} target */
function isTyping(target) {
  const el = /** @type {HTMLElement | null} */ (target);
  return el !== null && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

/**
 * @param {{
 *   registry: ReturnType<typeof import('./command-registry.js').createCommandRegistry>,
 *   documentRef?: Document,
 *   allowedWhileModal?: string[],
 * }} input
 */
export function bindStudioShortcuts({ registry, documentRef = document, allowedWhileModal = ['help.palette'] }) {
  /** @param {KeyboardEvent} event */
  function onKeyDown(event) {
    if (event.defaultPrevented) return;
    const command = registry.forEvent(event);
    if (command === null) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (isTyping(event.target) && (!modifier || TEXT_EDITING_KEYS.has(event.key.toLowerCase()))) return;
    const modalOpen = documentRef.querySelector('dialog[open]') !== null;
    if (modalOpen && !allowedWhileModal.includes(command.id)) return;
    if (registry.run(command.id)) event.preventDefault();
  }
  documentRef.addEventListener('keydown', onKeyDown);
  return { destroy: () => documentRef.removeEventListener('keydown', onKeyDown) };
}
