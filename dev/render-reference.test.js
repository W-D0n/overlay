import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const SOURCE_DIRECTORIES = [ROOT, join(ROOT, 'components'), join(ROOT, 'dev')];

function sourceFiles() {
  const files = [];
  for (const directory of SOURCE_DIRECTORIES) {
    for (const name of readdirSync(directory)) {
      if (/\.(js|html|css)$/.test(name) && !name.endsWith('.test.js') && name !== 'render-reference.js') {
        files.push(join(directory, name));
      }
    }
  }
  return files;
}

test('la résolution de la source OBS n’est écrite que dans render-reference.js', () => {
  const offenders = [];
  for (const file of sourceFiles()) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (/\b(1920|1080)\b/.test(line)) offenders.push(`${file.slice(ROOT.length + 1)}:${index + 1}`);
    });
  }
  expect(offenders).toEqual([]);
});
