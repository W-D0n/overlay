// @ts-check
/**
 * dev/scene-history-store.js — Lecture/écriture de l'historique d'une scène sur disque (effets de
 * bord, AD-1 — la logique de fenêtre glissante pure vit dans `scene-data-format.js`).
 *
 * Seul `scene-data-server.js` importe ce module (owner, 2026-07-06, voir
 * docs/specs/scene-history-protocol.md §Concurrence d'accès). Composition et placement passent par
 * ce même propriétaire. Deux process Bun distincts écrivant le même fichier provoquaient une race :
 * un `GET /scene-history` concurrent d'une écriture pouvait lire un fichier à moitié écrit
 * (`SyntaxError: Unexpected end of JSON input`), et deux écritures concurrentes pouvaient se
 * substituer l'une à l'autre et perdre silencieusement une entrée d'historique.
 *
 * Un seul process ne suffit pas à éliminer la race : un handler `async` qui traverse un `await`
 * (lecture disque) peut être interléavé par une autre requête sur la MÊME scène. `withHistoryLock`
 * (dev/keyed-lock.js) sérialise donc, par `sceneId`, toute opération de lecture/écriture sur une
 * chaîne de promesses en mémoire.
 */
import { rename } from 'node:fs/promises';
import { pushHistoryEntry } from './scene-data-format.js';
import { createKeyedLock } from './keyed-lock.js';

const HISTORY_DIR = `${import.meta.dir}/../scenes/data/.history`;

/** @typedef {{ timestamp: number, sceneConfig: import('../types.js').SceneConfig }[]} SceneHistory */

const withHistoryLock = createKeyedLock();

/**
 * @param {string} sceneId
 * @returns {Promise<SceneHistory>}
 */
async function readHistoryFile(sceneId) {
  const file = Bun.file(`${HISTORY_DIR}/${sceneId}.json`);
  if (!(await file.exists())) return [];
  return await file.json();
}

/**
 * Écrit via fichier temporaire + rename (atomique sur le système de fichiers) — défense en
 * profondeur contre un crash du process en plein milieu de l'écriture. Ne remplace pas
 * `withHistoryLock` : protège contre un fichier corrompu, pas contre une entrée perdue.
 * @param {string} sceneId
 * @param {SceneHistory} history
 * @returns {Promise<void>}
 */
async function writeHistoryFile(sceneId, history) {
  const target = `${HISTORY_DIR}/${sceneId}.json`;
  const tmp = `${target}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await Bun.write(tmp, `${JSON.stringify(history, null, 2)}\n`);
  await rename(tmp, target);
}

/**
 * @param {string} sceneId
 * @returns {Promise<SceneHistory>}
 */
export function readSceneHistory(sceneId) {
  return withHistoryLock(sceneId, () => readHistoryFile(sceneId));
}

/**
 * Ajoute une entrée à l'historique d'une scène (fenêtre glissante, voir `pushHistoryEntry`).
 * @param {string} sceneId
 * @param {import('../types.js').SceneConfig} sceneConfig
 * @returns {Promise<void>}
 */
export function appendSceneHistory(sceneId, sceneConfig) {
  return withHistoryLock(sceneId, async () => {
    const history = await readHistoryFile(sceneId);
    const updated = pushHistoryEntry(history, { timestamp: Date.now(), sceneConfig });
    await writeHistoryFile(sceneId, updated);
  });
}

/**
 * Écrit l'historique d'une scène tel quel (pas de fusion avec l'existant) — utilisé pour
 * repartir de zéro à la création d'une scène (id réutilisé après suppression traité comme une
 * scène entièrement nouvelle, pas une continuation de son ancien historique).
 * @param {string} sceneId
 * @param {SceneHistory} history
 * @returns {Promise<void>}
 */
export function writeSceneHistory(sceneId, history) {
  return withHistoryLock(sceneId, () => writeHistoryFile(sceneId, history));
}
