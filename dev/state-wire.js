// @ts-check
/**
 * dev/state-wire.js — La forme que le serveur d'état échange par HTTP et par ses canaux.
 *
 * Le modèle du serveur est un document de scène par preset et pour l'antenne (`background-state-format.js`). Les pages
 * de rendu, le Studio et les lots d'import parlent la forme plate `{ component, options, transition?, showBranding? }` :
 * ce module la convertit, dans les deux sens, à la frontière — nulle part ailleurs. Tant que le serveur ne lit que des
 * scènes « un effet et son branding » (`currentFromScene`), la conversion est sans perte ; une scène qui n'y tient pas
 * est une violation de cet invariant et lève, plutôt que de s'envoyer tronquée.
 *
 * Logique pure : ni disque, ni réseau.
 *
 * @typedef {import('./background-state-format.js').BackgroundCurrent} BackgroundCurrent
 * @typedef {import('./background-state-format.js').BackgroundPreset} BackgroundPreset
 * @typedef {import('./background-state-format.js').BackgroundFile} BackgroundFile
 * @typedef {import('../scene-doc.js').SceneDoc} SceneDoc
 * @typedef {{ at: string, current: BackgroundCurrent }} WireHistoryEntry
 */
import { currentFromScene, presetFromScene, sceneFromCurrent, sceneFromPreset } from '../scene-doc.js';
import { canonicalBackgroundCurrent, canonicalBackgroundPreset, validateBackgroundCurrent, validateBackgroundPreset } from './background-state-format.js';

/**
 * @param {SceneDoc} scene
 * @returns {BackgroundCurrent}
 */
export function wireCurrent(scene) {
  const current = currentFromScene(scene);
  if (current === null) throw new Error(`scène « ${scene.id} » sans forme plate : elle ne peut pas être envoyée aux pages de rendu`);
  return current;
}

/**
 * @param {SceneDoc} scene
 * @returns {BackgroundPreset}
 */
export function wirePreset(scene) {
  const preset = presetFromScene(scene);
  if (preset === null) throw new Error(`scène « ${scene.id} » sans forme plate : elle ne peut pas être envoyée comme preset`);
  return /** @type {BackgroundPreset} */ (preset);
}

/**
 * Ce que renvoie `GET /state` : le fichier sans son historique ni ses brouillons (qui ont leurs routes), en forme plate.
 * @param {BackgroundFile} file
 */
export function wireState(file) {
  const { current, scenes, history: _history, drafts: _drafts, ...rest } = file;
  return { ...rest, current: wireCurrent(current), presets: scenes.map(wirePreset) };
}

/**
 * @param {readonly import('./background-history.js').HistoryEntry[]} history
 * @returns {WireHistoryEntry[]}
 */
export function wireHistory(history) {
  return history.map((entry) => ({ at: entry.at, current: wireCurrent(entry.scene) }));
}

/**
 * @param {import('./preset-drafts.js').Drafts} drafts
 * @returns {Record<string, { at: string, state: BackgroundCurrent }>}
 */
export function wireDrafts(drafts) {
  return Object.fromEntries(Object.entries(drafts).map(([id, entry]) => [id, { at: entry.at, state: wireCurrent(entry.scene) }]));
}

/**
 * Un état en forme plate reçu d'un client : ramené à la forme neutre (un client plus ancien peut encore envoyer l'ancien
 * nom d'effet ou « Oui »), validé, puis converti en scène en antenne.
 * @param {unknown} raw
 * @returns {{ ok: true, scene: SceneDoc, current: BackgroundCurrent } | { ok: false, errors: string[] }}
 */
export function sceneFromWireCurrent(raw) {
  const current = /** @type {BackgroundCurrent} */ (canonicalBackgroundCurrent(/** @type {*} */ (raw)));
  const validation = validateBackgroundCurrent(current);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  return { ok: true, scene: sceneFromCurrent(current), current };
}

/**
 * Un preset en forme plate reçu d'un client, ramené à la forme neutre, validé, puis converti en scène.
 * @param {unknown} raw
 * @returns {{ ok: true, scene: SceneDoc, preset: BackgroundPreset } | { ok: false, errors: string[] }}
 */
export function sceneFromWirePreset(raw) {
  const preset = /** @type {BackgroundPreset} */ (canonicalBackgroundPreset(/** @type {*} */ (raw)));
  const validation = validateBackgroundPreset(preset);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  return { ok: true, scene: sceneFromPreset(preset), preset };
}
