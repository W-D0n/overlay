import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dir, '..');

/** A source file longer than this is a module that has stopped being one: it is split by domain (see docs/revue-finale.md, lot 3). */
const MAX_SOURCE_LINES = 700;

/**
 * Files allowed to be longer, each with its size as of today (it can only go down) and why splitting would not help. A file that fits again leaves this list: the test below says so.
 * @type {Record<string, { lines: number, reason: string }>}
 */
const EXEMPT = {
  'layer-kinds.js': { lines: 888, reason: 'une table de description : une entrée par type de couche (champs, bornes, capacités), sans logique à découper' },
};

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', '.playwright-mcp', '.claude', '.agents', 'docs', 'src-tauri', 'e2e', 'data', 'tools']);

/** The source files of the overlay: scripts, tests excluded. @param {string} directory @returns {string[]} */
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRECTORIES.has(entry.name) ? [] : sourceFiles(path);
    return entry.name.endsWith('.js') && !entry.name.endsWith('.test.js') ? [path] : [];
  });
}

const lineCount = (/** @type {string} */ path) => readFileSync(path, 'utf8').split('\n').length - (readFileSync(path, 'utf8').endsWith('\n') ? 1 : 0);
const sizes = sourceFiles(ROOT).map((path) => ({ file: relative(ROOT, path).replaceAll('\\', '/'), lines: lineCount(path) }));

describe('taille des fichiers source', () => {
  test('la mesure voit les fichiers du dépôt (elle ne passe pas à vide)', () => {
    expect(sizes.length).toBeGreaterThan(150);
    expect(sizes.some(({ file }) => file === 'dev/scene-editor.js')).toBe(true);
    expect(sizes.some(({ file }) => file.endsWith('.test.js'))).toBe(false);
    expect(sizes.find(({ file }) => file === 'layer-kinds.js')?.lines).toBeGreaterThan(MAX_SOURCE_LINES);
  });

  test(`aucun fichier source ne dépasse ${MAX_SOURCE_LINES} lignes, hors la liste des exemptions`, () => {
    const tooLong = sizes.filter(({ file, lines }) => lines > MAX_SOURCE_LINES && !(file in EXEMPT)).map(({ file, lines }) => `${file} : ${lines} lignes`);
    expect(tooLong).toEqual([]);
  });

  test('un fichier exempté ne grossit pas, et sort de la liste dès qu’il tient dans la limite', () => {
    for (const [file, { lines, reason }] of Object.entries(EXEMPT)) {
      const measured = sizes.find((entry) => entry.file === file);
      expect(measured, `${file} n'existe plus : le retirer de la liste`).toBeDefined();
      expect(reason.length).toBeGreaterThan(20);
      expect(/** @type {{ lines: number }} */ (measured).lines, `${file} a grossi`).toBeLessThanOrEqual(lines);
      expect(/** @type {{ lines: number }} */ (measured).lines, `${file} tient dans ${MAX_SOURCE_LINES} lignes : le retirer de la liste`).toBeGreaterThan(MAX_SOURCE_LINES);
    }
  });
});
