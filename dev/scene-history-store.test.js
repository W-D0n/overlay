// @ts-check
/**
 * Tests AC-14/AC-15 (docs/specs/scene-history-protocol.md §Concurrence d'accès) : deux écritures
 * concurrentes sur le même sceneId ne perdent aucune entrée, et une lecture concurrente d'une
 * écriture attend son tour au lieu de lire un fichier à moitié écrit.
 */
import { test, expect, afterEach } from 'bun:test';
import { readSceneHistory, appendSceneHistory } from './scene-history-store.js';

const HISTORY_DIR = `${import.meta.dir}/../scenes/data/.history`;

/** @type {(id: string) => import('../types.js').SceneConfig} */
const sceneConfig = (id) => ({ id, dotgridMode: null, transition: {}, layers: [] });

/** @type {string[]} */
const cleanupIds = [];

afterEach(async () => {
  while (cleanupIds.length > 0) {
    const id = /** @type {string} */ (cleanupIds.pop());
    await Bun.file(`${HISTORY_DIR}/${id}.json`).delete().catch(() => {});
  }
});

test('appendSceneHistory: deux écritures concurrentes sur le même sceneId conservent les deux entrées (AC-14)', async () => {
  const sceneId = `test-concurrent-${Date.now()}`;
  cleanupIds.push(sceneId);

  await Promise.all([
    appendSceneHistory(sceneId, sceneConfig(sceneId)),
    appendSceneHistory(sceneId, sceneConfig(sceneId)),
  ]);

  const history = await readSceneHistory(sceneId);
  expect(history.length).toBe(2);
});

test('readSceneHistory: une lecture déclenchée pendant une écriture en cours attend et retourne un JSON valide (AC-15)', async () => {
  const sceneId = `test-read-during-write-${Date.now()}`;
  cleanupIds.push(sceneId);

  const write = appendSceneHistory(sceneId, sceneConfig(sceneId));
  const read = readSceneHistory(sceneId);

  await expect(read).resolves.toBeArray();
  await write;

  const history = await read;
  expect(history.length).toBe(1);
});

test('appendSceneHistory: dix écritures concurrentes sur le même sceneId ne perdent aucune entrée (AC-14)', async () => {
  const sceneId = `test-concurrent-many-${Date.now()}`;
  cleanupIds.push(sceneId);

  await Promise.all(
    Array.from({ length: 10 }, () => appendSceneHistory(sceneId, sceneConfig(sceneId))),
  );

  const history = await readSceneHistory(sceneId);
  expect(history.length).toBe(10);
});
