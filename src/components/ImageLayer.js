// @ts-check
import { defineCanvasLayer } from './canvas-layer.js';
import { assetImages } from './asset-image.js';
import { resolveColor } from './color-utils.js';
import { fitImage } from './image-fit.js';
import { normalizeKindOptions } from './kind-options.js';

/**
 * components/ImageLayer.js — Couche de contenu « image » : une affiche, un logo, une photo de la médiathèque, dans la zone de la couche.
 *
 * Dessinée sur un canvas comme les effets et **statique** (`canvas-layer.js`). Le cadrage (contenir, couvrir, étirer) est dans
 * `image-fit.js`, le chargement partagé dans `asset-image.js`. Pendant qu'une autre image se charge, la précédente reste affichée :
 * un changement d'image ne laisse jamais un trou à l'antenne. Si l'image ne peut pas être chargée (asset supprimé, serveur
 * d'état éteint), la couche n'affiche rien plutôt qu'une image qui n'est plus la bonne.
 * Voir docs/specs/couches-de-contenu.md.
 *
 * @typedef {{
 *   asset: string, fit: 'contain' | 'cover' | 'fill', cornerRadius: number, strokeWidth: number, strokeColor: string,
 *   shadowBlur: number, shadowOffsetX: number, shadowOffsetY: number, shadowColor: string,
 * }} ImageOptions
 */

/** @param {string} value @returns {string} */
function rgbOf(value) {
  const [r, g, b] = resolveColor(value);
  return `rgb(${r},${g},${b})`;
}

/** @param {unknown} raw @returns {ImageOptions} */
export function normalizeImageOptions(raw) {
  return /** @type {ImageOptions} */ (normalizeKindOptions('image', raw));
}

/**
 * @param {{ loader?: Pick<typeof assetImages, 'load'>, warn?: (message: string) => void }} [environment]
 */
export function createImageLayer({ loader = assetImages, warn = (message) => console.warn(message) } = {}) {
  return defineCanvasLayer((/** @type {Record<string, unknown>} */ rawOptions, host) => {
    let options = normalizeImageOptions(rawOptions);
    let size = { width: 0, height: 0 };
    /** @type {{ naturalWidth: number, naturalHeight: number } | null} */
    let image = null;
    let wanted = '';
    /** @type {Record<string, string>} */
    let colors = {};

    function resolveColors() {
      colors = { stroke: rgbOf(options.strokeColor), shadow: rgbOf(options.shadowColor) };
    }
    resolveColors();

    /** Demande l'image réglée ; l'ancienne reste affichée jusqu'à l'arrivée de la nouvelle. @param {string} id */
    function request(id) {
      wanted = id;
      if (id === '') {
        image = null;
        host.invalidate();
        return;
      }
      loader.load(id).then((loaded) => {
        if (wanted !== id) return;
        image = /** @type {*} */ (loaded);
        host.invalidate();
      }, () => {
        if (wanted !== id) return;
        warn(`[ImageLayer] image introuvable dans la médiathèque : ${id}`);
        image = null;
        host.invalidate();
      });
    }
    request(options.asset);

    /** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} width @param {number} height @param {number} radius */
    function tracePath(ctx, x, y, width, height, radius) {
      ctx.beginPath();
      if (radius > 0) ctx.roundRect(x, y, width, height, radius);
      else ctx.rect(x, y, width, height);
    }

    return {
      animated: false,
      sceneScaled: true,

      resize(next) {
        size = next;
      },

      draw(ctx) {
        if (image === null) return;
        const half = options.strokeWidth / 2;
        const fit = fitImage(options.fit, { width: image.naturalWidth, height: image.naturalHeight }, { width: size.width - options.strokeWidth, height: size.height - options.strokeWidth });
        if (fit === null) return;
        const x = half + fit.dx;
        const y = half + fit.dy;
        const radius = Math.min(options.cornerRadius, fit.dw / 2, fit.dh / 2);
        const shadowed = options.shadowBlur > 0 || options.shadowOffsetX !== 0 || options.shadowOffsetY !== 0;
        ctx.save();
        if (shadowed) {
          ctx.shadowColor = colors.shadow;
          ctx.shadowBlur = options.shadowBlur;
          ctx.shadowOffsetX = options.shadowOffsetX;
          ctx.shadowOffsetY = options.shadowOffsetY;
        }
        if (radius > 0) {
          // Une image à coins arrondis est découpée : son ombre est celle de sa forme (la découpe supprimerait celle de l'image).
          if (shadowed) {
            tracePath(ctx, x, y, fit.dw, fit.dh, radius);
            ctx.fillStyle = colors.shadow;
            ctx.fill();
            ctx.shadowColor = 'transparent';
          }
          tracePath(ctx, x, y, fit.dw, fit.dh, radius);
          ctx.clip();
        }
        ctx.drawImage(/** @type {*} */ (image), fit.sx, fit.sy, fit.sw, fit.sh, x, y, fit.dw, fit.dh);
        ctx.restore();
        if (options.strokeWidth > 0) {
          tracePath(ctx, x, y, fit.dw, fit.dh, radius);
          ctx.lineWidth = options.strokeWidth;
          ctx.lineJoin = 'round';
          ctx.strokeStyle = colors.stroke;
          ctx.stroke();
        }
      },

      /** @param {unknown} next */
      update(next) {
        const merged = normalizeImageOptions(next);
        if (JSON.stringify(merged) === JSON.stringify(options)) return;
        const assetChanged = merged.asset !== options.asset;
        options = merged;
        resolveColors();
        if (assetChanged) request(options.asset);
        else host.invalidate();
      },
    };
  });
}

export const ImageLayer = createImageLayer();
