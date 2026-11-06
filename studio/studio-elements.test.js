import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as tables from './studio-elements.js';

const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const pageIds = new Set([...page.matchAll(/(?<![-\w])id="([^"]+)"/g)].map((match) => match[1]));

/** The ids a table asks for, in the order it asks. @param {(byId: (id: string) => unknown) => unknown} table */
function idsOf(table) {
  /** @type {string[]} */
  const asked = [];
  table((id) => { asked.push(id); return {}; });
  return asked;
}

describe('les tables d’éléments du Studio', () => {
  test('la page déclare ses identifiants (la lecture de studio.html fonctionne)', () => {
    expect(pageIds.size).toBeGreaterThan(200);
    expect(pageIds.has('layers-list')).toBe(true);
  });

  test('chaque table demande des éléments, tous présents dans studio.html', () => {
    const entries = Object.entries(tables);
    expect(entries.length).toBeGreaterThanOrEqual(13);
    for (const [name, table] of entries) {
      const asked = idsOf(/** @type {*} */ (table));
      expect(asked.length, name).toBeGreaterThan(0);
      expect(asked.filter((id) => !pageIds.has(id)), name).toEqual([]);
    }
  });

  test('aucune table ne demande deux fois le même élément', () => {
    for (const [name, table] of Object.entries(tables)) {
      const asked = idsOf(/** @type {*} */ (table));
      expect(asked.length - new Set(asked).size, name).toBe(0);
    }
  });

  test('les éléments que le câblage du tuner demande lui-même sont aussi dans la page', () => {
    const runtime = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
    const asked = [...runtime.matchAll(/\bbyId\('([^']+)'\)/g)].map((match) => match[1]);
    expect(asked.length).toBeGreaterThan(50);
    expect(asked.filter((id) => !pageIds.has(id))).toEqual([]);
  });
});
