// @ts-check
/**
 * dev/e2e/run.js — Essais de bout en bout du Studio, dans un vrai navigateur.
 *
 *   bun dev/e2e/run.js                 toutes les suites
 *   bun dev/e2e/run.js --only couches  les suites dont le nom contient « couches »
 *   bun dev/e2e/run.js --shots <dossier>  une capture d'écran en fin de chaque suite
 *
 * Lance de vrais serveurs sur des ports d'essai (jamais 5931/5932), pilote Chrome par des événements d'entrée réels et rend
 * un code de sortie non nul au premier contrôle en échec. Outillage de dev, lancé à la demande : rien n'est installé.
 */
import { readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser } from './browser.js';
import { startStack } from './stack.js';

const SUITES_DIR = join(import.meta.dir, 'suites');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;

const files = readdirSync(SUITES_DIR).filter((name) => name.endsWith('.e2e.js')).sort();
const stack = await startStack();
const browser = await launchBrowser({ stateRedirect: { from: 5932, to: stack.statePort } });
if (shots !== null) mkdirSync(shots, { recursive: true });

let failed = 0;
let total = 0;
try {
  for (const file of files) {
    const suite = await import(join(SUITES_DIR, file));
    if (only !== null && !suite.name.includes(only)) continue;
    console.info(`\n● ${suite.name}`);
    /** @type {{ name: string, ok: boolean, detail?: unknown }[]} */
    const results = [];
    const check = (/** @type {string} */ name, /** @type {unknown} */ value) => {
      const ok = value === true;
      results.push({ name, ok, ...(ok ? {} : { detail: value }) });
      console.info(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → ${JSON.stringify(value)}`}`);
    };
    stack.reset();
    browser.errors.length = 0;
    try {
      await suite.run({ page: browser, stack, check, errors: browser.errors });
    } catch (error) {
      check(`${suite.name} : la suite s'est interrompue`, `${error instanceof Error ? error.message : error}`);
    }
    if (shots !== null) await browser.screenshot(join(shots, `${file.replace('.e2e.js', '')}.png`));
    total += results.length;
    failed += results.filter((result) => !result.ok).length;
  }
} finally {
  await browser.close();
  await stack.stop();
}

console.info(`\n${total - failed} / ${total} contrôles réussis${failed === 0 ? '' : `, ${failed} en échec`}`);
process.exit(failed === 0 && total > 0 ? 0 : 1);
