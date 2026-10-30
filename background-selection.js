// @ts-check

import { STATIC_PORT } from './ports.config.js';
import { buildRenderUrl } from './render-url.js';
import { sceneFromCurrent, sceneFromPreset } from './scene-doc.js';

const DEFAULT_BACKGROUND_URL = `http://localhost:${STATIC_PORT}/background.html`;

/**
 * La scène qu'un état du serveur annonce pour l'antenne : sa `scene`, ou — d'un serveur qui ne la fournit pas encore —
 * la scène que dit sa forme plate. Vaut pour `GET /state` comme pour un message du canal `state`.
 * @param {{ scene?: import('./scene-doc.js').SceneDoc, component?: string | null, options?: Record<string, unknown> }} message
 * @returns {import('./scene-doc.js').SceneDoc}
 */
export function liveSceneOf(message) {
  return message.scene ?? sceneFromCurrent(/** @type {*} */ (message));
}

/**
 * Résout la scène rendue par une URL standalone.
 * Sans référence de preset, la page suit la scène en antenne du tuner. Avec un identifiant stable (ou
 * un ancien nom pour compatibilité), elle reste attachée au preset correspondant, avec toutes ses couches.
 *
 * @param {{
 *   scene?: import('./scene-doc.js').SceneDoc,
 *   scenes?: import('./scene-doc.js').SceneDoc[],
 *   current: { component: string | null, options: Record<string, unknown> },
 *   presets: { id: string, name: string, component: string, options: Record<string, unknown> }[],
 * }} file
 * @param {string|null} presetRef
 * @returns {import('./scene-doc.js').SceneDoc|null}
 */
export function selectScene(file, presetRef) {
  if (presetRef === null || presetRef === '') return liveSceneOf({ scene: file.scene, ...file.current });
  const scenes = file.scenes ?? file.presets.map((preset) => sceneFromPreset(preset));
  return scenes.find((candidate) => candidate.id === presetRef || candidate.name === presetRef) ?? null;
}

/** @param {string} [baseUrl] */
export function backgroundCurrentUrl(baseUrl = DEFAULT_BACKGROUND_URL) {
  return buildRenderUrl({ base: baseUrl, presetRef: null });
}

/**
 * @param {string} presetId
 * @param {string} [baseUrl]
 */
export function backgroundPresetUrl(presetId, baseUrl = DEFAULT_BACKGROUND_URL) {
  return buildRenderUrl({ base: baseUrl, presetRef: presetId });
}
