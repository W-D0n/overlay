// @ts-check
/**
 * dev/typecheck.js — Contrôle de types (outil de dev, jamais chargé par l'overlay ni par OBS).
 *
 * Lance TypeScript via `bunx` (téléchargé à la demande, aucune dépendance dans le dépôt) sur
 * `tsconfig.json`, puis compare le nombre d'erreurs par fichier à `dev/typecheck-baseline.json`.
 *
 * Lancement : `bun dev/typecheck.js`
 *   --update   réécrit la référence ; refusé si un fichier a gagné des erreurs.
 */
import { compareToBaseline, countErrorsByFile } from './typecheck-baseline.js';

const ROOT = `${import.meta.dir}/..`;
const BASELINE_FILE = `${import.meta.dir}/typecheck-baseline.json`;
const TYPESCRIPT_VERSION = '5.6.3';

const child = Bun.spawn(['bunx', '-p', `typescript@${TYPESCRIPT_VERSION}`, 'tsc', '-p', 'tsconfig.json'], {
  cwd: ROOT,
  stdout: 'pipe',
  stderr: 'pipe',
});
const output = `${await new Response(child.stdout).text()}${await new Response(child.stderr).text()}`;
await child.exited;

const current = countErrorsByFile(output);
const total = Object.values(current).reduce((sum, count) => sum + count, 0);
const hasBaseline = await Bun.file(BASELINE_FILE).exists();
/** @type {Record<string, number>} */
const baseline = hasBaseline ? await Bun.file(BASELINE_FILE).json() : {};
const { regressions, improvements } = compareToBaseline(current, baseline);

if (output.includes('error TS5') || output.includes('error TS6')) {
  console.error(output);
  console.error('[typecheck] configuration TypeScript invalide');
  process.exit(1);
}

if (process.argv.includes('--update')) {
  if (regressions.length > 0 && hasBaseline) {
    console.error(`[typecheck] référence non mise à jour, régressions :\n  ${regressions.join('\n  ')}`);
    process.exit(1);
  }
  const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  await Bun.write(BASELINE_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
  console.info(`[typecheck] référence écrite : ${total} erreur(s) dans ${Object.keys(sorted).length} fichier(s)`);
  process.exit(0);
}

if (regressions.length > 0) {
  console.error(`[typecheck] régression de typage :\n  ${regressions.join('\n  ')}`);
  console.error('Détail : `bunx -p typescript@' + TYPESCRIPT_VERSION + ' tsc -p tsconfig.json`');
  process.exit(1);
}
if (improvements.length > 0) {
  console.info(`[typecheck] progrès, lance \`bun dev/typecheck.js --update\` pour le figer :\n  ${improvements.join('\n  ')}`);
}
console.info(`[typecheck] ${total} erreur(s) restante(s), aucune régression`);
