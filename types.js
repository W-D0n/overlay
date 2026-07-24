/**
 * types.js — Types JSDoc partagés
 *
 * Pas de TypeScript ici (Browser Source = JS pur),
 * mais les JSDoc permettent l'autocomplétion dans VS Code
 * et documentent la forme des données attendues.
 *
 * USAGE : importer dans un composant ou un module de dev.
 *   // @ts-check
 *   /// <reference path="../types.js" />
 */

/**
 * Noms des effets de fond montables.
 * Dérivé de `component-names.js` (source unique) — ne plus étendre cette liste ici, éditer
 * `COMPONENT_NAMES`.
 * @typedef {typeof import('./component-names.js').COMPONENT_NAMES[number]} ComponentName
 */

/**
 * Easing d'une interpolation visuelle (`ComponentInstance.morphTo`).
 * @typedef {'easeInOut'|'easeIn'|'easeOut'|'linear'} TransitionEasing
 */

/**
 * Instance de composant montée — surface retournée par une factory d'effet de fond.
 * Toutes les méthodes sont optionnelles : un composant purement décoratif n'expose que `el`.
 *
 * Vue UNIFIÉE du registry pour des factories aux signatures hétérogènes : `update` est typé
 * `unknown` (les types précis vivent sur chaque factory).
 *
 * @typedef {Object} ComponentInstance
 * @property {HTMLElement} el                       - Élément racine, inséré dans le conteneur de fond
 * @property {(data: unknown) => void} [update]     - Rafraîchit le composant
 * @property {(options: unknown, duration: number, easing: TransitionEasing) => void} [morphTo] -
 *   Interpole visuellement vers de nouvelles options plutôt qu'un saut instantané (AD-B3,
 *   `docs/specs/background-effects-library.md`). Implémenté par `DotGridBackground`.
 * @property {() => void} [destroy]                 - Libère les ressources (observers, timers)
 * @property {(payload: unknown) => void} [trigger] - Réaction impérative à un événement discret
 *   (alerte stream). Optionnel : un effet sans `trigger` est couvert par `ReactionOverlay`
 *   (`background-reactions.js`, `docs/specs/background-reactive-events.md`).
 */

/**
 * Résultat d'une fonction de validation.
 * `errors` est vide si et seulement si `ok === true`.
 * @typedef {Object} ValidationResult
 * @property {boolean} ok        - true si la donnée respecte tous les invariants
 * @property {string[]} errors   - Liste exhaustive des violations (vide si ok)
 */

// Export vide pour permettre l'import en module si besoin
export {};
