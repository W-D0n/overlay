// @ts-check
import { defineCanvasLayer } from './canvas-layer.js';
import { resolveColor } from './color-utils.js';
import { normalizeKindOptions } from './kind-options.js';
import { gradientLine, pathLength, shapePath, traceParts } from './shape-geometry.js';

/**
 * components/ShapeLayer.js — Couche de contenu « forme » : un cadre, un bandeau, un cercle, un trait, dans la zone de la couche.
 *
 * Dessinée sur un canvas comme les effets et **statique** (`canvas-layer.js`) : elle ne se redessine que si ses options ou sa taille
 * changent. La géométrie est dans `shape-geometry.js`. Redimensionner la couche redimensionne la forme.
 * Une animation de tracé (`animate`) la redessine à chaque changement de présence, et seulement pendant l'animation : le contour se trace, puis le remplissage apparaît en fondu.
 * Voir docs/specs/couches-de-contenu.md.
 *
 * @typedef {{
 *   shape: 'rectangle' | 'ellipse' | 'triangle' | 'diamond' | 'line', fill: 'solid' | 'gradient' | 'none',
 *   color: string, color2: string, gradientAngle: number, strokeWidth: number, strokeColor: string, cornerRadius: number,
 *   shadowBlur: number, shadowOffsetX: number, shadowOffsetY: number, shadowColor: string,
 * }} ShapeOptions
 */

/** @param {string} value @returns {string} */
function rgbOf(value) {
  const [r, g, b] = resolveColor(value);
  return `rgb(${r},${g},${b})`;
}

/** @param {unknown} raw @returns {ShapeOptions} */
export function normalizeShapeOptions(raw) {
  return /** @type {ShapeOptions} */ (normalizeKindOptions('shape', raw));
}

export const ShapeLayer = defineCanvasLayer((/** @type {Record<string, unknown>} */ rawOptions, host) => {
  let options = normalizeShapeOptions(rawOptions);
  let size = { width: 0, height: 0 };
  /** @type {Record<string, string>} */
  let colors = {};

  function resolveColors() {
    colors = { color: rgbOf(options.color), color2: rgbOf(options.color2), stroke: rgbOf(options.strokeColor), shadow: rgbOf(options.shadowColor) };
  }
  resolveColors();

  /** Le tracé en cours (`layer-animation.js`) ; `null` : la forme est entière. @type {Extract<import('../layer-animation.js').ContentState, { kind: 'shape' }> | null} */
  let tracing = null;

  /** @param {CanvasRenderingContext2D} ctx @param {NonNullable<ReturnType<typeof shapePath>>} path */
  function trace(ctx, path) {
    ctx.beginPath();
    if (path.type === 'rect') {
      if (path.radius > 0) ctx.roundRect(path.x, path.y, path.width, path.height, path.radius);
      else ctx.rect(path.x, path.y, path.width, path.height);
    } else if (path.type === 'ellipse') {
      ctx.ellipse(path.cx, path.cy, path.rx, path.ry, 0, 0, Math.PI * 2);
    } else if (path.type === 'polygon') {
      path.points.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
    } else {
      ctx.moveTo(path.x1, path.y1);
      ctx.lineTo(path.x2, path.y2);
    }
  }

  return {
    animated: false,
    sceneScaled: true,

    resize(next) {
      size = next;
    },

    draw(ctx) {
      const path = shapePath({ shape: options.shape, width: size.width, height: size.height, strokeWidth: options.strokeWidth, cornerRadius: options.cornerRadius });
      if (path === null) return;
      ctx.lineJoin = 'round';
      if (options.shadowBlur > 0 || options.shadowOffsetX !== 0 || options.shadowOffsetY !== 0) {
        ctx.shadowColor = colors.shadow;
        ctx.shadowBlur = options.shadowBlur;
        ctx.shadowOffsetX = options.shadowOffsetX;
        ctx.shadowOffsetY = options.shadowOffsetY;
      }
      trace(ctx, path);
      // Un tracé en cours : une part du contour seulement, et un remplissage encore transparent.
      const parts = tracing === null ? null : traceParts(tracing.presence);
      const stroke = () => {
        if (parts !== null) ctx.setLineDash([pathLength(path) * parts.stroke, pathLength(path)]);
        ctx.stroke();
        if (parts !== null) ctx.setLineDash([]);
      };
      if (path.type === 'line') {
        ctx.lineWidth = Math.max(1, options.strokeWidth);
        ctx.strokeStyle = colors.stroke;
        stroke();
        return;
      }
      if (options.fill !== 'none') {
        if (options.fill === 'gradient') {
          const line = gradientLine(options.gradientAngle, size.width, size.height);
          const gradient = ctx.createLinearGradient(line.x0, line.y0, line.x1, line.y1);
          gradient.addColorStop(0, colors.color);
          gradient.addColorStop(1, colors.color2);
          ctx.fillStyle = gradient;
        } else {
          ctx.fillStyle = colors.color;
        }
        if (parts === null) {
          ctx.fill();
        } else {
          ctx.save();
          ctx.globalAlpha = parts.fill;
          ctx.fill();
          ctx.restore();
        }
      }
      if (options.strokeWidth > 0) {
        // Le contour est tracé sans ombre quand le remplissage en a déjà posé une.
        if (options.fill !== 'none') ctx.shadowColor = 'transparent';
        ctx.lineWidth = options.strokeWidth;
        ctx.strokeStyle = colors.stroke;
        stroke();
      }
      ctx.shadowColor = 'transparent';
    },

    /** @param {import('../layer-animation.js').ContentState | null} next */
    animate(next) {
      // La forme entière se dessine d'un seul trait, comme sans animation.
      const wanted = next === null || next.kind !== 'shape' || next.presence >= 1 ? null : next;
      if (JSON.stringify(wanted) === JSON.stringify(tracing)) return;
      tracing = wanted;
      host.invalidate();
    },

    /** @param {unknown} next */
    update(next) {
      const merged = normalizeShapeOptions(next);
      if (JSON.stringify(merged) === JSON.stringify(options)) return;
      options = merged;
      resolveColors();
      host.invalidate();
    },
  };
});
