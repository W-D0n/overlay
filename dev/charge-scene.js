// @ts-check
/**
 * charge-scene.js — Scène de mesure de charge : N couches pleine taille, options par défaut de chaque type.
 * Sert `dev/charge.html` (docs/specs/scene-doc-etape-4.md, « Mesure de charge »). Pleine taille = pire cas :
 * chaque couche est un canvas de la taille de la source.
 */
import { LAYER_KINDS, LAYER_KIND_IDS, isLayerKindId } from '../layer-kinds.js';
import { MAX_LAYERS, SCENE_DOC_VERSION, createLayer } from '../scene-doc.js';

/** Ordre des types quand l'URL n'en nomme pas : les plus courants d'abord. */
export const LOAD_KIND_ORDER = /** @type {const} */ (['dotgrid', 'fireflies', 'rain', 'bubble', 'stars-parallax', 'water-ripple', 'orbiting-shapes', 'shape-morph']);

/**
 * @param {string} [search] `location.search`
 * @returns {{ count: number, kinds: import('../layer-kinds.js').LayerKindId[], hud: boolean }}
 */
export function parseLoadUrl(search = '') {
  const params = new URLSearchParams(search);
  const param = params.get('couches');
  const raw = param === null || param.trim() === '' ? Number.NaN : Number(param);
  const count = Number.isInteger(raw) ? Math.min(MAX_LAYERS, Math.max(0, raw)) : 1;
  const named = (params.get('types') ?? '').split(',').filter(isLayerKindId);
  return { count, kinds: named.length > 0 ? named : [...LOAD_KIND_ORDER], hud: params.get('hud') !== '0' };
}

/**
 * @param {number} count
 * @param {import('../layer-kinds.js').LayerKindId[]} [kinds] repris en boucle si moins nombreux que `count`
 * @returns {import('../scene-doc.js').SceneDoc}
 */
export function buildLoadScene(count, kinds = [...LOAD_KIND_ORDER]) {
  if (!Number.isInteger(count) || count < 0 || count > MAX_LAYERS) throw new RangeError(`couches : 0 à ${MAX_LAYERS}`);
  const pool = kinds.length > 0 ? kinds : [...LAYER_KIND_IDS];
  return {
    version: SCENE_DOC_VERSION,
    id: 'charge',
    name: 'Mesure de charge',
    layers: Array.from({ length: count }, (_, index) => {
      const kind = pool[index % pool.length];
      return createLayer({
        id: `charge-${index + 1}`,
        kind,
        options: Object.fromEntries(LAYER_KINDS[kind].fields.map((field) => [field.key, field.default])),
      });
    }),
  };
}
