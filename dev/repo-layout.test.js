import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard: the repository root stays a short, fixed list. Engine modules live in `src/<domain>/`, the Studio and the servers in `dev/`; a module dropped at the root
 * (the 76 `layer-*`, `scene-*`, `background-*`… files it once held) fails here instead of piling up again.
 */
const ROOT = join(import.meta.dir, '..');

const ROOT_FILES = new Set([
  'AGENTS.md', 'CLAUDE.md', 'README.md', 'tsconfig.json', '.env', '.env.example', '.gitattributes', '.gitignore',
  'background.html', 'ports.config.js', 'studio.bat', 'stream.bat', 'kill-servers.bat',
]);
const ROOT_DIRECTORIES = new Set(['src', 'dev', 'docs', 'src-tauri', '.git', '.claude', '.agents', '.codex', '.playwright-mcp', 'node_modules']);
const SRC_ENTRIES = new Set(['background', 'branding', 'components', 'layers', 'obs', 'render', 'scene', 'styles', 'types.js']);

const names = (/** @type {string} */ directory) => readdirSync(directory, { withFileTypes: true });

describe('structure du dépôt', () => {
  test('la racine ne contient que des fichiers et des dossiers connus', () => {
    const entries = names(ROOT);
    expect(entries.length).toBeGreaterThan(8);
    const unknown = entries.filter((entry) => !(entry.isDirectory() ? ROOT_DIRECTORIES : ROOT_FILES).has(entry.name)).map((entry) => entry.name);
    expect(unknown).toEqual([]);
  });

  test('src/ ne contient que les domaines connus, et chaque domaine un seul sujet', () => {
    const entries = names(join(ROOT, 'src'));
    expect(entries.map((entry) => entry.name).sort()).toEqual([...SRC_ENTRIES].sort());
    for (const domain of entries.filter((entry) => entry.isDirectory() && entry.name !== 'components' && entry.name !== 'styles')) {
      const modules = names(join(ROOT, 'src', domain.name)).filter((entry) => entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.test.js'));
      expect(modules.length, `${domain.name} est vide`).toBeGreaterThan(0);
    }
  });
});
