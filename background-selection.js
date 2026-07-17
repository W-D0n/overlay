// @ts-check

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
 * @param {string} presetId
 * @param {string} [baseUrl]
 * @param {{ performance?: boolean }} [options]
 */
export function backgroundPresetUrl(presetId, baseUrl = 'http://localhost:5500/background.html', options = {}) {
  const url = new URL(baseUrl);
  url.searchParams.set('preset', presetId);
  url.searchParams.set('transparent', '1');
  if (options.performance === true) url.searchParams.set('quality', 'performance');
  return url.toString();
}
