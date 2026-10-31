// @ts-check
import { STATE_SERVER_URL } from '../ports.config.js';

/**
 * components/asset-image.js — Charge l'image d'un asset de la médiathèque (`dev/asset-routes.js`), une seule fois par identifiant.
 *
 * Le contenu d'un identifiant ne change jamais : une image déjà chargée (ou en cours) est partagée par toutes les couches qui la
 * montrent, et le navigateur la garde en cache. L'image est chargée avec `crossOrigin = 'anonymous'` (la page de rendu et le
 * serveur d'état n'ont pas la même origine) : sans cela, le canvas qui la dessine ne pourrait plus être photographié pour les
 * vignettes. Un chargement qui échoue n'est pas retenu : le suivant réessaie.
 */

/** Nombre d'images gardées ; au-delà, la plus ancienne est oubliée (les couches qui la montrent la gardent). */
const CACHE_SIZE = 24;

/** @param {string} id @returns {string} l'adresse du fichier d'un asset */
export function assetUrl(id) {
  return `${STATE_SERVER_URL}/assets/${id}`;
}

/**
 * @typedef {{ crossOrigin: string | null, decoding: string, onload: (() => void) | null, onerror: (() => void) | null, src: string, naturalWidth: number, naturalHeight: number }} ImageLike
 */

/**
 * @param {{ ImageImpl?: new () => ImageLike, urlOf?: (id: string) => string }} [environment]
 */
export function createAssetImageLoader({ ImageImpl = /** @type {*} */ (globalThis).Image, urlOf = assetUrl } = {}) {
  /** @type {Map<string, Promise<ImageLike>>} */
  const cache = new Map();

  return {
    /**
     * @param {string} id
     * @returns {Promise<ImageLike>}
     */
    load(id) {
      const cached = cache.get(id);
      if (cached !== undefined) return cached;
      const promise = new Promise((resolve, reject) => {
        const image = new ImageImpl();
        image.crossOrigin = 'anonymous';
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => {
          cache.delete(id);
          reject(new Error(`image introuvable : ${id}`));
        };
        image.src = urlOf(id);
      });
      cache.set(id, promise);
      if (cache.size > CACHE_SIZE) cache.delete(/** @type {string} */ (cache.keys().next().value));
      return promise;
    },
  };
}

/** Le chargeur partagé par toutes les couches image de la page. */
export const assetImages = createAssetImageLoader();
