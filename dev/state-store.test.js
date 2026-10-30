import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from './state-store.js';

/** @type {string[]} */
const directories = [];

function workspace() {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-state-store-'));
  directories.push(directory);
  const path = join(directory, 'state.json');
  return { path, store: createStateStore({ path, log: { info() {} } }) };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('createStateStore', () => {
  test('fichier absent : état par défaut, rien n’est créé par une lecture', async () => {
    const { path, store } = workspace();
    const read = await store.read();
    expect(read.ok).toBe(true);
    expect(existsSync(path)).toBe(false);
  });

  test('fichier illisible ou invalide : les erreurs sont rendues, le fichier n’est pas touché', async () => {
    const { path, store } = workspace();
    writeFileSync(path, '{ pas du json');
    const read = await store.read();
    expect(read.ok).toBe(false);
    const result = await store.transact((file) => ({ file }));
    expect(result.status).toBe('unreadable');
    expect(readFileSync(path, 'utf8')).toBe('{ pas du json');
  });

  test('transact écrit le fichier décidé puis appelle afterWrite après l’écriture', async () => {
    const { path, store } = workspace();
    let seenOnDisk = null;
    const result = await store.transact((file) => ({
      file: { ...file, sceneMap: { 'Scène 1': 'alpha' } },
      afterWrite: () => { seenOnDisk = existsSync(path); },
    }));
    expect(result.status).toBe('written');
    expect(seenOnDisk).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8')).sceneMap).toEqual({ 'Scène 1': 'alpha' });
  });

  test('abort : rien n’est écrit et la valeur est rendue telle quelle', async () => {
    const { path, store } = workspace();
    const result = await store.transact(() => ({ abort: 'refusé' }));
    expect(result).toEqual({ status: 'aborted', abort: 'refusé' });
    expect(existsSync(path)).toBe(false);
  });

  test('les écritures concurrentes sont sérialisées : aucune mise à jour perdue', async () => {
    const { store } = workspace();
    await Promise.all(Array.from({ length: 20 }, (_, index) => store.transact((file) => ({
      file: { ...file, sceneMap: { ...(file.sceneMap ?? {}), [`s${index}`]: `p${index}` } },
    }))));
    const read = await store.read();
    expect(read.ok && Object.keys(read.file.sceneMap ?? {}).length).toBe(20);
  });

  test('inspect lit sous le même verrou : il ne voit jamais un état intermédiaire', async () => {
    const { store } = workspace();
    const writing = store.transact((file) => ({ file: { ...file, sceneMap: { a: 'b' } } }));
    const viewing = store.inspect((file) => Object.keys(file.sceneMap ?? {}).length);
    await writing;
    expect(await viewing).toEqual({ status: 'read', value: 1 });
  });
});
