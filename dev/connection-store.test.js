import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
  expect(await setup().store.read()).toEqual({ obs: {}, twitchat: {}, twitch: {} });
});

test('update écrit, et la lecture suivante le retrouve', async () => {
  const { store, path } = setup();
  await store.update((file) => applyObsPatch(file, { password: 'secret' }));
  expect(await store.read()).toEqual({ obs: { password: 'secret' }, twitchat: {}, twitch: {} });
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ obs: { password: 'secret' }, twitchat: {}, twitch: {} });
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
  expect(await store.read()).toEqual({ obs: { url: 'ws://a:1', password: 'p' }, twitchat: {}, twitch: {} });
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

test('le jeton de Twitchat est créé une fois, puis gardé', async () => {
  const { store, path } = setup();
  const first = await store.twitchatToken();
  expect(first).toMatch(/^[0-9a-f]{48}$/);
  expect(await store.twitchatToken()).toBe(first);
  expect(JSON.parse(readFileSync(path, 'utf8')).twitchat.token).toBe(first);
});

test('des demandes simultanées du jeton donnent toutes le même', async () => {
  const { store } = setup();
  const tokens = await Promise.all([store.twitchatToken(), store.twitchatToken(), store.twitchatToken()]);
  expect(new Set(tokens).size).toBe(1);
});

test('régénérer donne un jeton différent, que la lecture suivante retrouve', async () => {
  const { store } = setup();
  const first = await store.twitchatToken();
  const second = await store.regenerateTwitchatToken();
  expect(second).not.toBe(first);
  expect(await store.twitchatToken()).toBe(second);
});

test('changer le mot de passe garde le jeton, et inversement', async () => {
  const { store } = setup();
  const token = await store.twitchatToken();
  await store.update((file) => applyObsPatch(file, { password: 'p' }));
  expect(await store.twitchatToken()).toBe(token);
  await store.regenerateTwitchatToken();
  expect((await store.read()).obs.password).toBe('p');
});

test('une transformation qui rend le fichier tel quel n’écrit rien', async () => {
  const { store, path } = setup();
  await store.update((file) => file);
  expect(existsSync(path)).toBe(false);
});
