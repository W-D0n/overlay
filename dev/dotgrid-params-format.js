// @ts-check
/**
 * dev/dotgrid-params-format.js — Génération du texte source pour les paramètres DotGrid (logique pure).
 *
 * Aucun effet de bord (pas de lecture/écriture disque ici — ça vit dans `tuner-server.js`).
 * Opère sur une chaîne de code source en entrée, retourne une nouvelle chaîne. Déterministe,
 * testable sans I/O réelle (AD-1).
 */

/**
 * Génère le bloc `export const MODE_PARAMS = { ... };` à partir des valeurs courantes.
 *
 * @param {Record<string, { freqX: number, freqY: number, freqT: number, amplitude: number }>} modeParams
 * @param {string[]} order - Ordre d'affichage des modes (ex: `GRID_MODES`)
 * @returns {string}
 */
export function formatModeParamsBlock(modeParams, order) {
  const longestName = Math.max(...order.map((m) => m.length));
  const lines = order.map((mode) => {
    const p = modeParams[mode];
    return `  ${mode.padEnd(longestName)}: { freqX: ${p.freqX}, freqY: ${p.freqY}, freqT: ${p.freqT}, amplitude: ${p.amplitude} },`;
  });
  return `export const MODE_PARAMS = {\n${lines.join('\n')}\n};`;
}

/**
 * Remplacer le bloc `MODE_PARAMS` et les valeurs par défaut `baseOpacity`/`dotRadius` dans le
 * code source de `components/DotGridAnimated.js` par les nouvelles valeurs.
 * Ne modifie que ces 3 zones précises — le reste du fichier (commentaires, logique) est préservé.
 *
 * @param {string} sourceCode - Contenu actuel de DotGridAnimated.js
 * @param {{
 *   modeParams: Record<string, { freqX: number, freqY: number, freqT: number, amplitude: number }>,
 *   order: string[],
 *   baseOpacity: number,
 *   dotRadius: number,
 * }} params
 * @returns {string} Nouveau contenu du fichier
 * @throws {Error} Si l'un des 3 motifs attendus n'est pas trouvé (fichier modifié entre-temps)
 */
export function applyDotGridParamsToSource(sourceCode, { modeParams, order, baseOpacity, dotRadius }) {
  const modeParamsBlock = /export const MODE_PARAMS = \{[\s\S]*?\n\};/;
  if (!modeParamsBlock.test(sourceCode)) {
    throw new Error('Bloc MODE_PARAMS introuvable — le fichier a peut-être changé de structure.');
  }
  let updated = sourceCode.replace(modeParamsBlock, formatModeParamsBlock(modeParams, order));

  const dotRadiusLine = /const dotRadius {3}= options\.dotRadius {3}\?\? [\d.]+;/;
  if (!dotRadiusLine.test(updated)) {
    throw new Error('Ligne dotRadius introuvable — le fichier a peut-être changé de structure.');
  }
  updated = updated.replace(dotRadiusLine, `const dotRadius   = options.dotRadius   ?? ${dotRadius};`);

  const baseOpacityLine = /const baseOpacity = options\.baseOpacity \?\? [\d.]+;/;
  if (!baseOpacityLine.test(updated)) {
    throw new Error('Ligne baseOpacity introuvable — le fichier a peut-être changé de structure.');
  }
  updated = updated.replace(baseOpacityLine, `const baseOpacity = options.baseOpacity ?? ${baseOpacity};`);

  return updated;
}
