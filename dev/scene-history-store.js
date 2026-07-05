// @ts-check
/**
 * dev/scene-history-store.js — Lecture/écriture de l'historique d'une scène sur disque (effets de
 * bord, AD-1 — la logique de fenêtre glissante pure vit dans `scene-data-format.js`).
 *
 * Partagé par `scene-data-server.js` (composition/création/suppression) ET `placement-server.js`
 * (drag & drop de placement) pour qu'ils alimentent le MÊME historique par scène — comble le trou
 * documenté dans docs/specs/scene-history-protocol.md (owner, 2026-07-05) : un déplacement de
 * couche n'était pas annulable, seules les modifications de composition l'étaient.
 */
import { pushHistoryEntry } from './scene-data-format.js';

const HISTORY_DIR = `${import.meta.dir}/../scenes/data/.history`;

/**
 * @param {string} sceneId
 * @returns {Promise<{ timestamp: number, sceneConfig: import('../types.js').SceneConfig }[]>}
 */
export async function readSceneHistory(sceneId) {
  const file = Bun.file(`${HISTORY_DIR}/${sceneId}.json`);
  if (!(await file.exists())) return [];
  return await file.json();
}

/**
 * Ajoute une entrée à l'historique d'une scène (fenêtre glissante, voir `pushHistoryEntry`).
 * @param {string} sceneId
 * @param {import('../types.js').SceneConfig} sceneConfig
 * @returns {Promise<void>}
 */
export async function appendSceneHistory(sceneId, sceneConfig) {
  const history = await readSceneHistory(sceneId);
  const updated = pushHistoryEntry(history, { timestamp: Date.now(), sceneConfig });
  await writeSceneHistory(sceneId, updated);
}

/**
 * Écrit l'historique d'une scène tel quel (pas de fusion avec l'existant) — utilisé pour
 * repartir de zéro à la création d'une scène (id réutilisé après suppression traité comme une
 * scène entièrement nouvelle, pas une continuation de son ancien historique).
 * @param {string} sceneId
 * @param {{ timestamp: number, sceneConfig: import('../types.js').SceneConfig }[]} history
 * @returns {Promise<void>}
 */
export async function writeSceneHistory(sceneId, history) {
  await Bun.write(`${HISTORY_DIR}/${sceneId}.json`, `${JSON.stringify(history, null, 2)}\n`);
}
