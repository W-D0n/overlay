// @ts-check
import { kindDefaults, normalizeKindOptions } from './kind-options.js';
import { TEXT_MIN_FIT_SIZE } from './text-layer.config.js';

/**
 * components/text-layout.js — La mise en page d'une couche texte : pur, sans canvas ni DOM. À partir des options et de la zone de
 * la couche, il donne la taille retenue et les lignes à dessiner ; `TextLayer` n'a plus qu'à peindre. La mesure d'une ligne est
 * fournie (le canvas la donne, un test la simule).
 *
 * @typedef {{
 *   text: string[], font: string, fontSize: number, bold: boolean, italic: boolean, uppercase: boolean, color: string,
 *   align: 'left' | 'center' | 'right', verticalAlign: 'top' | 'middle' | 'bottom', lineHeight: number, letterSpacing: number,
 *   fit: 'shrink' | 'none', wrap: boolean, outlineWidth: number, outlineColor: string,
 *   shadowBlur: number, shadowOffsetX: number, shadowOffsetY: number, shadowColor: string,
 * }} TextOptions
 * @typedef {{ size: number, lineHeightPx: number, lines: string[], top: number, left: number, right: number, fits: boolean }} TextLayout
 */

/** Les options de départ du type `text`, lues de son schéma (`layer-kinds.js`) : une seule source. */
export const TEXT_DEFAULTS = /** @type {TextOptions} */ (kindDefaults('text'));

/**
 * Des options reçues (peut-être partielles, anciennes ou invalides) aux options complètes du texte.
 * @param {unknown} raw
 * @returns {TextOptions}
 */
export function normalizeTextOptions(raw) {
  return /** @type {TextOptions} */ (normalizeKindOptions('text', raw));
}

/**
 * Coupe une ligne en lignes d'au plus `width` : aux espaces, et dans un mot seulement s'il est plus large que la zone.
 * @param {string} line
 * @param {number} width
 * @param {(text: string) => number} measure
 * @returns {string[]}
 */
export function wrapLine(line, width, measure) {
  if (line === '' || measure(line) <= width) return [line];
  /** @type {string[]} */
  const lines = [];
  let current = '';
  for (const word of line.split(/(?<=\s)/)) {
    const candidate = current + word;
    if (current === '' || measure(candidate.trimEnd()) <= width) {
      current = candidate;
    } else {
      lines.push(current.trimEnd());
      current = word;
    }
    // Un mot plus large que la zone se coupe aux lettres.
    while (measure(current.trimEnd()) > width && current.length > 1) {
      let cut = current.length - 1;
      while (cut > 1 && measure(current.slice(0, cut)) > width) cut -= 1;
      lines.push(current.slice(0, cut));
      current = current.slice(cut);
    }
  }
  if (current !== '') lines.push(current.trimEnd());
  return lines;
}

/**
 * @param {{ options: TextOptions, box: { width: number, height: number }, measure: (text: string, size: number) => number }} input
 * @returns {TextLayout}
 */
export function layoutText({ options, box, measure }) {
  const pad = options.outlineWidth;
  const innerWidth = Math.max(1, box.width - 2 * pad);
  const innerHeight = Math.max(1, box.height - 2 * pad);
  const source = options.text.map((line) => (options.uppercase ? line.toLocaleUpperCase() : line));

  /** @param {number} size */
  const arrange = (size) => {
    const lines = options.wrap ? source.flatMap((line) => wrapLine(line, innerWidth, (text) => measure(text, size))) : source;
    const widest = Math.max(0, ...lines.map((line) => measure(line, size)));
    const height = lines.length * options.lineHeight * size;
    return { lines, fits: widest <= innerWidth + 0.01 && height <= innerHeight + 0.01, height };
  };

  let size = options.fontSize;
  let arranged = arrange(size);
  if (options.fit === 'shrink' && !arranged.fits) {
    let low = TEXT_MIN_FIT_SIZE;
    let high = size;
    if (!arrange(low).fits) {
      size = low;
    } else {
      // La plus grande taille qui tient : la recherche garde `low` toujours valide.
      for (let step = 0; step < 14 && high - low > 0.25; step += 1) {
        const middle = (low + high) / 2;
        if (arrange(middle).fits) low = middle; else high = middle;
      }
      size = low;
    }
    arranged = arrange(size);
  }

  const lineHeightPx = options.lineHeight * size;
  const top = options.verticalAlign === 'top' ? pad : options.verticalAlign === 'bottom' ? box.height - pad - arranged.height : (box.height - arranged.height) / 2;
  return { size, lineHeightPx, lines: arranged.lines, top, left: pad, right: box.width - pad, fits: arranged.fits };
}
