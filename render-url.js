// @ts-check
/**
 * render-url.js — Contrat d'URL de la page de rendu (`background.html`) : un seul module lit et construit.
 *
 * Paramètres : `preset` (id stable ou ancien nom) ou son synonyme `scene` (`preset` l'emporte s'il est renseigné), `branding` (`off` | `only`), `transparent=1`,
 * `quality=performance`. Une valeur inconnue retombe sur la valeur neutre : l'URL d'une Browser Source
 * ancienne doit toujours s'afficher.
 *
 * @typedef {'on' | 'off' | 'only'} BrandingMode
 * @typedef {'auto' | 'performance'} RenderQuality
 * @typedef {{ presetRef: string | null, branding: BrandingMode, transparent: boolean, quality: RenderQuality }} RenderUrlParams
 */

/**
 * @param {string} [search] `location.search`
 * @returns {RenderUrlParams}
 */
export function parseRenderUrl(search = '') {
  const params = new URLSearchParams(search);
  const preset = params.get('preset') || params.get('scene');
  const brandingParam = params.get('branding');
  /** @type {BrandingMode} */
  const branding = brandingParam === 'off' || brandingParam === 'only' ? brandingParam : 'on';
  return {
    presetRef: preset === null || preset === '' ? null : preset,
    branding,
    // `only` pose la couche d'identité sur une autre source : fond transparent obligatoire.
    transparent: params.get('transparent') === '1' || branding === 'only',
    quality: params.get('quality') === 'performance' ? 'performance' : 'auto',
  };
}

/**
 * @param {{ base: string, presetRef?: string | null, quality?: RenderQuality, branding?: BrandingMode }} input
 * @returns {string}
 */
export function buildRenderUrl({ base, presetRef = null, quality = 'auto', branding = 'on' }) {
  const url = new URL(base);
  if (presetRef !== null) url.searchParams.set('preset', presetRef);
  url.searchParams.set('transparent', '1');
  if (quality === 'performance') url.searchParams.set('quality', 'performance');
  if (branding !== 'on') url.searchParams.set('branding', branding);
  return url.toString();
}
