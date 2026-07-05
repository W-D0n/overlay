// @ts-check
/**
 * dev/design-tokens.js — Liste organisée des tokens CSS de `tokens.css`, pour les champs de type
 * `'token'` du panneau (`dev/component-field-schemas.js`) — évite de devoir connaître par cœur les
 * noms de variables CSS pour éditer un composant (owner, 2026-07-05, "peu friendly").
 *
 * Recopie manuelle des valeurs de `tokens.css` (pas de parsing CSS — liste courte, change
 * rarement ; à tenir à jour si de nouveaux tokens pertinents pour l'édition sont ajoutés).
 *
 * @type {Record<string, string[]>}
 */
export const DESIGN_TOKENS = {
  color: [
    'var(--color-bg)', 'var(--color-bg-panel)', 'var(--color-bg-widget)', 'var(--color-bg-bar)',
    'var(--color-rule)', 'var(--color-rule-mid)',
    'var(--color-gold)', 'var(--color-gold-dim)', 'var(--color-gold-bar)', 'var(--color-gold-bar-bot)',
    'var(--color-text-primary)', 'var(--color-text-mid)', 'var(--color-text-dim)',
    'var(--color-text-ghost)', 'var(--color-text-dead)',
  ],
  border: [
    'var(--border-rule)', 'var(--border-rule-mid)', 'var(--border-gold)', 'var(--border-panel)',
  ],
  radius: [
    'var(--radius-sm)', 'var(--radius-md)',
  ],
};

/**
 * Libellé lisible d'un token (`var(--color-gold)` → `color-gold`) — pour l'affichage dans un menu
 * déroulant sans le bruit visuel de `var(--...)`.
 * @param {string} token
 * @returns {string}
 */
export function tokenLabel(token) {
  return token.replace(/^var\(--/, '').replace(/\)$/, '');
}
