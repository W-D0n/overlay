import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..');

/** Every file under `directory`, subfolders included. @param {string} directory @returns {string[]} */
function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? filesUnder(join(directory, entry.name)) : [join(directory, entry.name)]));
}

function sourceFiles() {
  const topLevel = [ROOT].flatMap((directory) => readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => join(directory, entry.name)));
  return [...topLevel, ...filesUnder(join(ROOT, 'src')), ...filesUnder(join(ROOT, 'studio')), ...filesUnder(join(ROOT, 'server'))].filter((file) => /\.(js|html|css)$/.test(file) && !file.endsWith('.test.js') && !file.endsWith('render-reference.js'));
}

test('la résolution de la source OBS n’est écrite que dans render-reference.js', () => {
  expect(sourceFiles().length).toBeGreaterThan(150);
  const offenders = [];
  for (const file of sourceFiles()) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (/\b(1920|1080)\b/.test(line)) offenders.push(`${file.slice(ROOT.length + 1)}:${index + 1}`);
    });
  }
  expect(offenders).toEqual([]);
});
