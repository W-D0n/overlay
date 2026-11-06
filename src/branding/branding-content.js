// @ts-check
/**
 * branding-content.js — Le contenu du branding (pseudo, lignes, style) : global, partagé par toutes les couches `branding`.
 *
 * Le contenu se règle une fois dans le panneau Branding et arrive par son canal ; chaque couche `branding` d'une scène
 * l'affiche à son placement. Ce module est le point de rencontre entre les deux : la page y dépose le contenu reçu, les
 * couches s'y abonnent.
 */

/**
 * @param {unknown} [initial]
 */
export function createBrandingContent(initial) {
  /** @type {unknown} */
  let content = initial;
  /** @type {Set<(content: unknown) => void>} */
  const listeners = new Set();

  return {
    get: () => content,
    /** @param {unknown} next */
    set(next) {
      content = next;
      for (const listener of listeners) listener(next);
    },
    /**
     * @param {(content: unknown) => void} listener
     * @returns {() => void} désabonnement
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/** Le contenu de la page : un seul par page (rendu OBS, Studio). */
export const brandingContent = createBrandingContent();
