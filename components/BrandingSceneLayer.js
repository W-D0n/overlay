// @ts-check
import { brandingContent } from '../branding-content.js';
import { BrandingLayer } from './BrandingLayer.js';

/**
 * components/BrandingSceneLayer.js — Le branding comme couche d'une scène (type `branding`, `layer-kinds.js`).
 *
 * Au contrat des couches (`{ el, update?, destroy? }`) : elle affiche le contenu global du branding
 * (`branding-content.js`) et le suit en direct ; ses `options` sont vides, son placement, son opacité et sa
 * visibilité sont ceux du calque que lui donne `scene-runtime.js`.
 *
 * @param {Record<string, unknown>} [_options]
 * @param {{ content?: ReturnType<typeof import('../branding-content.js').createBrandingContent>, createLayer?: typeof BrandingLayer }} [environment]
 * @returns {import('../types.js').ComponentInstance}
 */
export function BrandingSceneLayer(_options, environment = {}) {
  const content = environment.content ?? brandingContent;
  const layer = (environment.createLayer ?? BrandingLayer)(content.get());
  const unsubscribe = content.subscribe((next) => layer.update(next));
  return {
    el: layer.el,
    update() {},
    destroy() {
      unsubscribe();
      layer.destroy();
    },
  };
}
