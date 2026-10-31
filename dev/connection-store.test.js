import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnectionStore } from './connection-store.js';
import { applyObsPatch } from './connection-settings.js';

/** @type {string[]} */
const directories = [];
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-connections-'));
  directories.push(directory);
  const path = join(directory, 'state.json.connections.json');
  return { directory, path, store: createConnectionStore({ path }) };
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

test('un fichier absent se lit comme des réglages vides', async () => {
  expect(await setup().store.read()).toEqual({ obs: {} });
});

test('update écrit, et la lecture suivante le retrouve', async () => {
  const { store, path } = setup();
  await store.update((file) => applyObsPatch(file, { password: 'secret' }));
  expect(await store.read()).toEqual({ obs: { password: 'secret' } });
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ obs: { password: 'secret' } });
});

test('l’écriture ne laisse aucun fichier temporaire', async () => {
  const { store, directory } = setup();
  await store.update((file) => applyObsPatch(file, { password: 'secret' }));
  expect(readdirSync(directory)).toEqual(['state.json.connections.json']);
});

test('des mises à jour simultanées se suivent : aucune n’en écrase une autre', async () => {
  const { store } = setup();
  await Promise.all([
    store.update((file) => applyObsPatch(file, { url: 'ws://a:1' })),
    store.update((file) => applyObsPatch(file, { password: 'p' })),
  ]);
  expect(await store.read()).toEqual({ obs: { url: 'ws://a:1', password: 'p' } });
});

test('un fichier illisible est signalé et jamais écrasé', async () => {
  const { store, path } = setup();
  writeFileSync(path, '{ pas du json');
  await expect(store.read()).rejects.toThrow('illisible');
  await expect(store.update((file) => applyObsPatch(file, { password: 'x' }))).rejects.toThrow('illisible');
  expect(readFileSync(path, 'utf8')).toBe('{ pas du json');
});

test('une mise à jour qui échoue ne bloque pas la suivante', async () => {
  const { store } = setup();
  await expect(store.update(() => { throw new Error('boum'); })).rejects.toThrow('boum');
  await store.update((file) => applyObsPatch(file, { password: 'ok' }));
  expect((await store.read()).obs.password).toBe('ok');
});
