import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard: the repository keeps one short, fixed shape. The engine lives in `src/<domain>/`, the Studio (browser) in `studio/`, the Bun servers in `server/`, the checks in `tools/`,
 * the end-to-end suites in `e2e/`. A module dropped at the root, or a folder that is not listed here, fails instead of piling up again.
 */
const ROOT = join(import.meta.dir, '..', '..');

const ROOT_FILES = new Set([
  'AGENTS.md', 'CLAUDE.md', 'README.md', 'tsconfig.json', '.env', '.env.example', '.gitattributes', '.gitignore',
  'background.html', 'ports.config.js', 'studio.bat', 'stream.bat', 'kill-servers.bat',
]);
const ROOT_DIRECTORIES = new Set(['src', 'studio', 'server', 'tools', 'e2e', 'data', 'docs', 'src-tauri', '.git', '.claude', '.agents', '.codex', '.playwright-mcp', 'node_modules']);
/** Each folder with the sub-folders it may hold (a file is never listed: only folders are constrained). */
const FOLDERS = {
  src: ['background', 'branding', 'components', 'layers', 'obs', 'render', 'scene', 'shared', 'styles'],
  studio: ['bench', 'canvas', 'editor', 'inspector', 'layers', 'presets', 'settings', 'ui'],
  server: ['integrations', 'lifecycle', 'routes', 'stores'],
  tools: ['guards', 'types'],
  e2e: ['suites'],
};

const entries = (/** @type {string} */ directory) => readdirSync(directory, { withFileTypes: true });
const folders = (/** @type {string} */ directory) => entries(directory).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

describe('structure du dépôt', () => {
  test('la racine ne contient que des fichiers et des dossiers connus', () => {
    const all = entries(ROOT);
    expect(all.length).toBeGreaterThan(8);
    const unknown = all.filter((entry) => !(entry.isDirectory() ? ROOT_DIRECTORIES : ROOT_FILES).has(entry.name)).map((entry) => entry.name);
    expect(unknown).toEqual([]);
  });

  for (const [folder, expected] of Object.entries(FOLDERS)) {
    test(`${folder}/ ne contient que ses sous-dossiers connus, sans module orphelin à côté`, () => {
      expect(folders(join(ROOT, folder))).toEqual([...expected].sort());
    });
  }

  test('chaque domaine contient au moins un module', () => {
    for (const [folder, expected] of Object.entries(FOLDERS)) {
      for (const domain of expected.filter((name) => name !== 'types' && name !== 'suites' && name !== 'styles')) {
        const modules = entries(join(ROOT, folder, domain)).filter((entry) => entry.isFile() && entry.name.endsWith('.js'));
        expect(modules.length, `${folder}/${domain} est vide`).toBeGreaterThan(0);
      }
    }
  });
});
