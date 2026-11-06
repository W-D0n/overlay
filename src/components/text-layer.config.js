// @ts-check
/**
 * components/text-layer.config.js — Données du type de couche `text` : pile de repli de chaque famille de police, quand
 * `tokens.css` n'est pas chargé (essais, page sans feuille de style). Les piles de référence sont les tokens `--font-*`.
 */

/** @type {Readonly<Record<string, string>>} */
export const TEXT_FONT_FALLBACKS = Object.freeze({
  serif: "'Times New Roman', Georgia, serif",
  sans: "'Segoe UI', Arial, sans-serif",
  mono: "'Courier New', monospace",
  display: "Impact, 'Arial Black', sans-serif",
});

/** Taille la plus petite que l'ajustement à la zone peut atteindre (px de la source de référence). */
export const TEXT_MIN_FIT_SIZE = 4;
