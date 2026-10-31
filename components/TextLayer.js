// @ts-check
import { defineCanvasLayer } from './canvas-layer.js';
import { resolveColor } from './color-utils.js';
import { TEXT_FONT_FALLBACKS } from './text-layer.config.js';
import { fontFamilyCss, isFontInstalled, layoutText, normalizeTextOptions, sanitizeFontFamily } from './text-layout.js';

/**
 * components/TextLayer.js — Couche de contenu « texte » : un titre, un pseudo, un message, dans la zone de la couche.
 *
 * Dessinée sur un canvas comme les effets : la même chaîne de rendu (échelle de la source, vignettes, coût) s'applique, et le texte
 * reste net à toute résolution. Couche **statique** (`canvas-layer.js`) : elle ne se redessine que si ses options ou sa taille
 * changent. La mise en page (retour à la ligne, ajustement à la zone) est dans `text-layout.js`.
 * Voir docs/specs/couches-de-contenu.md.
 */

/** @param {string} font @returns {string} la pile de la famille : le token `--font-*` de `tokens.css`, sinon le repli */
function fontStack(font) {
  const token = typeof getComputedStyle === 'function' && typeof document !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue(`--font-${font}`).trim()
    : '';
  return token === '' ? (TEXT_FONT_FALLBACKS[font] ?? TEXT_FONT_FALLBACKS.serif) : token;
}

/** @param {string} value @returns {string} */
function rgbOf(value) {
  const [r, g, b] = resolveColor(value);
  return `rgb(${r},${g},${b})`;
}

export const TextLayer = defineCanvasLayer((/** @type {Record<string, unknown>} */ rawOptions, host) => {
  let options = normalizeTextOptions(rawOptions);
  let size = { width: 0, height: 0 };
  /** @type {Record<string, string>} */
  let colors = {};

  function resolveColors() {
    colors = {
      color: rgbOf(options.color),
      outline: rgbOf(options.outlineColor),
      shadow: rgbOf(options.shadowColor),
    };
  }
  resolveColors();

  /** @param {CanvasRenderingContext2D} ctx @param {number} px */
  function applyFont(ctx, px) {
    ctx.font = `${options.italic ? 'italic ' : ''}${options.bold ? '700' : '400'} ${px}px ${fontFamilyCss(options.fontFamily, fontStack(options.font))}`;
    ctx.letterSpacing = `${options.letterSpacing}px`;
  }

  /** Le nom de police déjà signalé introuvable : un avertissement par nom, pas un à chaque dessin. */
  let warnedFont = '';

  /** @param {CanvasRenderingContext2D} ctx */
  function warnIfMissingFont(ctx) {
    const name = sanitizeFontFamily(options.fontFamily);
    if (name === '' || name === warnedFont) return;
    const saved = ctx.font;
    const installed = isFontInstalled(name, (family) => {
      ctx.font = `100px ${family}`;
      return ctx.measureText('mmmmmmmmmmlli').width;
    });
    ctx.font = saved;
    warnedFont = name;
    if (!installed) console.warn(`[TextLayer] police « ${name} » introuvable sur cet ordinateur : la famille choisie est utilisée`);
  }

  return {
    animated: false,
    sceneScaled: true,

    resize(next) {
      size = next;
    },

    draw(ctx) {
      warnIfMissingFont(ctx);
      const layout = layoutText({
        options,
        box: size,
        measure: (text, px) => {
          applyFont(ctx, px);
          return ctx.measureText(text).width;
        },
      });
      applyFont(ctx, layout.size);
      ctx.textBaseline = 'middle';
      ctx.textAlign = options.align;
      ctx.lineJoin = 'round';
      const x = options.align === 'left' ? layout.left : options.align === 'right' ? layout.right : (layout.left + layout.right) / 2;
      layout.lines.forEach((line, index) => {
        const y = layout.top + (index + 0.5) * layout.lineHeightPx;
        if (options.shadowBlur > 0 || options.shadowOffsetX !== 0 || options.shadowOffsetY !== 0) {
          // Une seule ombre par ligne : sous le contour s'il y en a un, sinon sous le texte.
          ctx.shadowColor = colors.shadow;
          ctx.shadowBlur = options.shadowBlur;
          ctx.shadowOffsetX = options.shadowOffsetX;
          ctx.shadowOffsetY = options.shadowOffsetY;
        }
        if (options.outlineWidth > 0) {
          ctx.lineWidth = options.outlineWidth * 2;
          ctx.strokeStyle = colors.outline;
          ctx.strokeText(line, x, y);
          ctx.shadowColor = 'transparent';
        }
        ctx.fillStyle = colors.color;
        ctx.fillText(line, x, y);
        ctx.shadowColor = 'transparent';
      });
    },

    /** @param {unknown} next */
    update(next) {
      const merged = normalizeTextOptions(next);
      if (JSON.stringify(merged) === JSON.stringify(options)) return;
      options = merged;
      resolveColors();
      host.invalidate();
    },
  };
});
