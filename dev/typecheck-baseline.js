// @ts-check
/**
 * dev/typecheck-baseline.js — Comparaison du résultat de `tsc` à la référence enregistrée.
 *
 * Le projet a été écrit avec `// @ts-check` mais sans aucun vérificateur lancé : la dette de typage
 * est mesurée par fichier puis ne peut que baisser. Un fichier qui gagne des erreurs, ou un fichier
 * sans erreur qui en reçoit, fait échouer le contrôle.
 */

/**
 * @param {string} output Sortie de `tsc` (format par défaut, une erreur par ligne)
 * @returns {Record<string, number>} Nombre d'erreurs par fichier
 */
export function countErrorsByFile(output) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const line of output.split(/\r?\n/)) {
    const match = /^(.+?)\(\d+,\d+\): error TS\d+/.exec(line);
    if (match === null) continue;
    const file = match[1].replaceAll('\\', '/');
    counts[file] = (counts[file] ?? 0) + 1;
  }
  return counts;
}

/**
 * @param {Record<string, number>} current
 * @param {Record<string, number>} baseline
 * @returns {{ regressions: string[], improvements: string[] }}
 */
export function compareToBaseline(current, baseline) {
  const regressions = [];
  const improvements = [];
  for (const file of new Set([...Object.keys(current), ...Object.keys(baseline)])) {
    const now = current[file] ?? 0;
    const before = baseline[file] ?? 0;
    if (now > before) regressions.push(`${file} : ${before} → ${now} erreur(s)`);
    if (now < before) improvements.push(`${file} : ${before} → ${now} erreur(s)`);
  }
  return { regressions, improvements };
}
