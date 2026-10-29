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

/**
 * @param {string | null} presetId
 * @param {string} baseUrl
 * @param {{ performance?: boolean }} options
 */
function backgroundUrl(presetId, baseUrl, options) {
  return buildRenderUrl({
    base: baseUrl,
    presetRef: presetId,
    quality: options.performance === true ? 'performance' : 'auto',
  });
}

/**
 * @param {string} [baseUrl]
 * @param {{ performance?: boolean }} [options]
 */
export function backgroundCurrentUrl(baseUrl = DEFAULT_BACKGROUND_URL, options = {}) {
  return backgroundUrl(null, baseUrl, options);
}

/**
 * @param {string} presetId
 * @param {string} [baseUrl]
 * @param {{ performance?: boolean }} [options]
 */
export function backgroundPresetUrl(presetId, baseUrl = DEFAULT_BACKGROUND_URL, options = {}) {
  return backgroundUrl(presetId, baseUrl, options);
}
