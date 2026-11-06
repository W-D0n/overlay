import { expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Guard: an exported name that nothing uses — no other file, no test, not even its own file — is dead code. It is found by a rule that does not depend on any instance seen once:
 * every `export function|const|let|class NAME` of a source file must be mentioned somewhere else than its declaration.
 */
const ROOT = join(import.meta.dir, '..', '..');
const SKIPPED = new Set(['node_modules', '.git', 'docs', 'assets']);

/** @param {string} directory @returns {string[]} */
function sources(directory) {
  return readdirSync(directory).flatMap((entry) => {
    if (SKIPPED.has(entry)) return [];
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(js|html)$/.test(entry) ? [path] : [];
  });
}

test('every exported name is used somewhere', () => {
  const texts = new Map(sources(ROOT).map((path) => [relative(ROOT, path), readFileSync(path, 'utf8')]));
  // The identifiers of each file with their count, read once: a name is used if another file has it, or its own file has it more than at its declaration.
  const counts = new Map([...texts].map(([file, text]) => {
    /** @type {Map<string, number>} */
    const tally = new Map();
    for (const [word] of text.matchAll(/[A-Za-z_$][\w$]*/g)) tally.set(word, (tally.get(word) ?? 0) + 1);
    return [file, tally];
  }));
  const declaration = /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
  /** @type {string[]} */
  const dead = [];
  for (const [file, text] of texts) {
    if (/\.test\.js$/.test(file) || file.includes('e2e')) continue;
    for (const [, name] of text.matchAll(declaration)) {
      const inOwnFile = (counts.get(file)?.get(name) ?? 0) - 1;
      const elsewhere = [...counts].some(([other, tally]) => other !== file && tally.has(name));
      if (inOwnFile === 0 && !elsewhere) dead.push(`${file}: ${name}`);
    }
  }
  expect(dead).toEqual([]);
});
