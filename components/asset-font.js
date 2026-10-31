// @ts-check
import { assetUrl } from './asset-image.js';

/**
 * components/asset-font.js — Charge la police d'un asset de la médiathèque (`dev/asset-routes.js`) pour qu'un texte la dessine.
 *
 * Même principe que les images (`asset-image.js`) : le contenu d'un identifiant ne change jamais, donc une police chargée (ou en cours de
 * chargement) est partagée par toutes les couches qui l'emploient ; un chargement qui échoue n'est pas retenu, le suivant réessaie. La police est
 * déclarée sous un nom de famille **propre à son identifiant** (`overlay-asset-…`) : deux polices importées ne se confondent jamais, et ni leur nom de
 * fichier ni celui d'une police installée n'entrent en jeu. Une police qui n'est pas encore chargée laisse le texte dans sa famille de repli ; la
 * couche se redessine à l'arrivée de la police.
 */

/** @param {string} id @returns {string} le nom de famille CSS sous lequel la police d'un asset est déclarée */
export function assetFontFamily(id) {
  return `overlay-asset-${id}`;
}

/**
 * @typedef {{ load: () => Promise<unknown> }} FontFaceLike
 * @param {{ FontFaceImpl?: new (family: string, source: string) => FontFaceLike, fonts?: { add: (face: FontFaceLike) => unknown } | null, urlOf?: (id: string) => string }} [environment]
 */
export function createAssetFontLoader({ FontFaceImpl = /** @type {*} */ (globalThis).FontFace, fonts = /** @type {*} */ (globalThis).document?.fonts ?? null, urlOf = assetUrl } = {}) {
  /** @type {Map<string, Promise<string>>} */
  const cache = new Map();

  return {
    /**
     * @param {string} id
     * @returns {Promise<string>} le nom de famille, une fois la police chargée et disponible
     */
    load(id) {
      const cached = cache.get(id);
      if (cached !== undefined) return cached;
      const family = assetFontFamily(id);
      const promise = (async () => {
        if (FontFaceImpl === undefined || fonts === null) throw new Error('ce navigateur ne sait pas charger de polices');
        const face = new FontFaceImpl(family, `url("${urlOf(id)}")`);
        await face.load();
        fonts.add(face);
        return family;
      })();
      cache.set(id, promise);
      promise.catch(() => cache.delete(id));
      return promise;
    },
  };
}

/** Le chargeur partagé par toutes les couches texte et la médiathèque de la page. */
export const assetFonts = createAssetFontLoader();
