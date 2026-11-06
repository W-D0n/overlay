import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Guard: no file keeps a trace of the layout the repository had before `src/`, `studio/`, `server/`, `tools/` and `e2e/` (flat root, one `dev/` folder, `start-dev`).
 * It reads every text file of the repository, docs and history included, and looks for the old paths and names themselves; this file is the only place that spells them out.
 */
const ROOT = join(import.meta.dir, '..', '..');
const SKIPPED = new Set(['node_modules', '.git', 'target', 'gen', '.playwright-mcp', 'data', '.codex']);
const TEXT = /\.(js|cjs|html|css|json|md|bat|rs|toml|ts|yml|yaml|txt)$|^\.gitignore$|^\.gitattributes$/;

const OLD = [
  ['dev/ folder (path)', /(^|[^\w/.-])dev\/(?!\s)/],
  ['dev\\ folder (Windows path)', /(^|[^\w/.\\-])dev\\[\w.]/],
  ['start-dev launcher', /start-dev/],
  ['start-stream.bat launcher', /start-stream\.bat/],
  ['components/ at the root', /(^|[^\w/.-])components\/[\w*]/],
  ['former Studio entry module', /background-tuner-runtime/],
  ['tokens.css at the root', /(['"`(]|\.\.?)\/tokens\.css/],
];

/** @param {string} directory @returns {string[]} */
function textFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return SKIPPED.has(entry.name) ? [] : textFiles(path);
    return TEXT.test(entry.name) ? [path] : [];
  });
}

test('aucun fichier ne garde une trace de l’ancienne organisation', () => {
  const files = textFiles(ROOT).filter((path) => !path.endsWith('old-layout.test.js'));
  expect(files.length).toBeGreaterThan(400);
  const traces = [];
  for (const path of files) {
    readFileSync(path, 'utf8').split('\n').forEach((line, index) => {
      for (const [label, pattern] of OLD) if (pattern.test(line)) traces.push(`${relative(ROOT, path).replaceAll('\\', '/')}:${index + 1} ${label}`);
    });
  }
  expect(traces).toEqual([]);
});
