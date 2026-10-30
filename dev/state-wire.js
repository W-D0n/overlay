// @ts-check
/**
 * dev/state-wire.js — La forme que le serveur d'état échange par HTTP et par ses canaux.
 *
 * Le modèle du serveur est un document de scène par preset et pour l'antenne (`background-state-format.js`). Deux
 * formes coexistent sur le fil :
 *  - la **scène** (`scene`, `scenes`), autoritaire, complète : toutes les couches, leur placement, leur opacité ;
 *  - la **forme plate** `{ component, options, transition?, showBranding? }` que les pages de rendu et le Studio déjà
 *    chargés comprennent. Elle n'existe que pour une scène « un effet et son branding » (`currentFromScene`). Pour une
 *    autre scène, la projection plate de l'antenne est *vide* (`component: null`, branding masqué) et celle d'un preset
 *    est absente : une page non rechargée n'affiche alors rien plutôt qu'une version tronquée de la scène.
 *
 * Ce module convertit dans les deux sens, à la frontière — nulle part ailleurs. Logique pure : ni disque, ni réseau.
 *
 * @typedef {import('./background-state-format.js').BackgroundCurrent} BackgroundCurrent
 * @typedef {import('./background-state-format.js').BackgroundPreset} BackgroundPreset
 * @typedef {import('./background-state-format.js').BackgroundFile} BackgroundFile
 * @typedef {import('../scene-doc.js').SceneDoc} SceneDoc
 * @typedef {{ at: string, current: BackgroundCurrent, scene: SceneDoc }} WireHistoryEntry
 * @typedef {{ at: string, state: BackgroundCurrent, scene: SceneDoc }} WireDraftEntry
 */
import { CURRENT_SCENE, canonicalSceneDoc, currentFromScene, presetFromScene, sceneFromCurrent, sceneFromPreset, validateSceneDoc } from '../scene-doc.js';
import {
  canonicalBackgroundCurrent,
  canonicalBackgroundPreset,
  validateBackgroundCurrent,
  validateBackgroundPreset,
  validateNamedScene,
} from './background-state-format.js';

/**
 * La projection plate de la scène en antenne ; vide quand la scène n'a pas de forme plate.
 * @param {SceneDoc} scene
 * @returns {BackgroundCurrent}
 */
export function wireCurrent(scene) {
  return currentFromScene(scene) ?? { component: null, options: {}, showBranding: false };
}

/**
 * La projection plate d'un preset, ou `null` quand la scène n'en a pas.
 * @param {SceneDoc} scene
 * @returns {BackgroundPreset | null}
 */
export function wirePreset(scene) {
  return /** @type {BackgroundPreset | null} */ (presetFromScene(scene));
}

/**
 * Ce qui part sur le canal `state` à chaque changement d'antenne.
 * @param {SceneDoc} scene
 */
export function wireBroadcast(scene) {
  return { ...wireCurrent(scene), scene };
}

/**
 * Ce que renvoie `GET /state` : le fichier sans son historique ni ses brouillons (qui ont leurs routes), en scènes et en
 * forme plate.
 * @param {BackgroundFile} file
 */
export function wireState(file) {
  const { current, scenes, history: _history, drafts: _drafts, ...rest } = file;
  return {
    ...rest,
    current: wireCurrent(current),
    scene: current,
    presets: scenes.flatMap((scene) => wirePreset(scene) ?? []),
    scenes,
  };
}

/**
 * @param {readonly import('./background-history.js').HistoryEntry[]} history
 * @returns {WireHistoryEntry[]}
 */
export function wireHistory(history) {
  return history.map((entry) => ({ at: entry.at, current: wireCurrent(entry.scene), scene: entry.scene }));
}

/**
 * @param {import('./preset-drafts.js').Drafts} drafts
 * @returns {Record<string, WireDraftEntry>}
 */
export function wireDrafts(drafts) {
  return Object.fromEntries(Object.entries(drafts).map(([id, entry]) => [id, { at: entry.at, state: wireCurrent(entry.scene), scene: entry.scene }]));
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

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} raw @param {string} id @param {unknown} name */
function withIdentity(raw, id, name) {
  return isRecord(raw) ? { ...raw, id, name } : raw;
}

/**
 * Une scène reçue d'un client pour passer à l'antenne : ramenée à la forme neutre, validée (elle peut n'avoir aucune
 * couche), puis placée sous l'identité de l'antenne — le nom et l'identifiant du client n'y comptent pas.
 * @param {unknown} raw
 * @returns {{ ok: true, scene: SceneDoc } | { ok: false, errors: string[] }}
 */
export function liveSceneFromWire(raw) {
  const identified = withIdentity(raw, CURRENT_SCENE.id, CURRENT_SCENE.name);
  const canonical = canonicalSceneDoc(/** @type {SceneDoc} */ (identified));
  const validation = validateSceneDoc(canonical, { allowEmpty: true });
  if (!validation.ok) return { ok: false, errors: validation.errors };
  const { tags: _tags, ...scene } = canonical;
  return { ok: true, scene };
}

/**
 * Une scène reçue d'un client pour être rangée comme preset (ou comme brouillon d'un preset) : forme neutre, puis tout
 * ce que la bibliothèque exige d'une scène nommée. L'identifiant est celui que choisit le serveur ; le nom, celui du
 * client.
 * @param {unknown} raw
 * @param {string} id
 * @returns {{ ok: true, scene: SceneDoc } | { ok: false, errors: string[] }}
 */
export function namedSceneFromWire(raw, id) {
  const identified = withIdentity(raw, id, isRecord(raw) ? raw.name : undefined);
  const canonical = canonicalSceneDoc(/** @type {SceneDoc} */ (identified));
  const errors = validateNamedScene(canonical);
  return errors.length === 0 ? { ok: true, scene: canonical } : { ok: false, errors };
}
