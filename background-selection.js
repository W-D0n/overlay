// @ts-check

import { STATIC_PORT } from './ports.config.js';
import { buildRenderUrl } from './render-url.js';

const DEFAULT_BACKGROUND_URL = `http://localhost:${STATIC_PORT}/background.html`;

/**
 * Résout le fond rendu par une URL standalone.
 * Sans référence de preset, la page suit l'état courant du tuner. Avec un identifiant stable (ou
 * un ancien nom pour compatibilité), elle reste attachée au preset correspondant.
 *
 * @param {{current:{component:string|null,options:Record<string,unknown>},presets:{id?:string,name:string,component:string,options:Record<string,unknown>}[]}} file
 * @param {string|null} presetRef
 * @returns {{component:string|null,options:Record<string,unknown>}|null}
 */
export function selectBackground(file, presetRef) {
  if (presetRef === null || presetRef === '') return file.current;
  const preset = file.presets.find((candidate) => candidate.id === presetRef || candidate.name === presetRef);
  return preset === undefined ? null : { component: preset.component, options: preset.options };
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
