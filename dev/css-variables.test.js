import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');

/** Pages et feuilles de style du dépôt, hors outils et données. */
function styledFiles() {
  const files = [];
  for (const directory of [ROOT, join(ROOT, 'dev'), join(ROOT, 'components')]) {
    for (const name of readdirSync(directory)) {
      if (/\.(html|css)$/.test(name)) files.push(join(directory, name));
    }
  }
  return files;
}

function definedIn(text) {
  return new Set([...text.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
}

test('chaque var(--x) sans valeur de repli est définie dans tokens.css ou dans son propre fichier', () => {
  const tokens = definedIn(readFileSync(join(ROOT, 'tokens.css'), 'utf8'));
  const undefinedUses = [];
  for (const file of styledFiles()) {
    const text = readFileSync(file, 'utf8');
    const local = definedIn(text);
    for (const [, name] of text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
      if (!tokens.has(name) && !local.has(name)) undefinedUses.push(`${file.slice(ROOT.length + 1)} : ${name}`);
    }
  }
  expect([...new Set(undefinedUses)]).toEqual([]);
});
