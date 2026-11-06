import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..');

/** Pages et feuilles de style du dépôt, hors outils et données. */
function styledFiles() {
  return [ROOT, ...directoriesUnder(join(ROOT, 'studio')), ...directoriesUnder(join(ROOT, 'src'))].flatMap((directory) =>
    readdirSync(directory).filter((name) => /\.(html|css)$/.test(name)).map((name) => join(directory, name)));
}

/** `directory` and every folder below it. @param {string} directory @returns {string[]} */
function directoriesUnder(directory) {
  return [directory, ...readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => directoriesUnder(join(directory, entry.name)))];
}

function definedIn(text) {
  return new Set([...text.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
}

test('chaque var(--x) sans valeur de repli est définie dans tokens.css ou dans son propre fichier', () => {
  const tokens = definedIn(readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8'));
  const undefinedUses = [];
  expect(styledFiles().length).toBeGreaterThan(5);
  for (const file of styledFiles()) {
    const text = readFileSync(file, 'utf8');
    const local = definedIn(text);
    for (const [, name] of text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
      if (!tokens.has(name) && !local.has(name)) undefinedUses.push(`${file.slice(ROOT.length + 1)} : ${name}`);
    }
  }
  expect([...new Set(undefinedUses)]).toEqual([]);
});
