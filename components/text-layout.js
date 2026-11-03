// @ts-check
import { kindDefaults, normalizeKindOptions } from './kind-options.js';
import { TEXT_MIN_FIT_SIZE } from './text-layer.config.js';

/**
 * components/text-layout.js — La mise en page d'une couche texte : pur, sans canvas ni DOM. À partir des options et de la zone de
 * la couche, il donne la taille retenue et les lignes à dessiner ; `TextLayer` n'a plus qu'à peindre. La mesure d'une ligne est
 * fournie (le canvas la donne, un test la simule).
 *
 * @typedef {{
 *   text: string[], font: string, fontFamily: string, fontAsset: string, fontSize: number, bold: boolean, italic: boolean, uppercase: boolean, color: string,
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

/** Longueur maximale d'un nom de police. */
export const FONT_FAMILY_MAX = 80;

/**
 * Le nom d'une police installée prêt à entrer dans une pile CSS : sans guillemet, barre oblique inverse, accolade, point-virgule, virgule,
 * chevron ni caractère de contrôle (rien ne sort de la pile), espaces rognés, borné. Vide si rien de valable ne reste.
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeFontFamily(raw) {
  // eslint-disable-next-line no-control-regex
  return String(raw ?? '').replace(/["'\\{};,<>\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, FONT_FAMILY_MAX);
}

/**
 * La valeur de `font-family` d'une couche texte : la police importée (si elle est chargée), puis la police installée demandée, puis la pile de la
 * famille choisie en repli.
 * @param {string} custom la police demandée (brute)
 * @param {string} stack la pile de la famille choisie
 * @param {string} [imported] le nom de famille de la police importée, chargée ; vide sinon
 * @returns {string}
 */
export function fontFamilyCss(custom, stack, imported = '') {
  const name = sanitizeFontFamily(custom);
  const base = name === '' ? stack : `"${name}", ${stack}`;
  return imported === '' ? base : `"${imported}", ${base}`;
}

/**
 * Vrai si une police est installée : un texte d'essai mesuré dans cette police, puis dans deux polices génériques de repli, change
 * de largeur. Si les deux mesures sont identiques à celles du repli, le navigateur n'a pas trouvé la police.
 * @param {string} name
 * @param {(family: string) => number} measure largeur du texte d'essai dans une pile donnée
 * @returns {boolean}
 */
export function isFontInstalled(name, measure) {
  const quoted = `"${sanitizeFontFamily(name)}"`;
  return measure(`${quoted}, monospace`) !== measure('monospace') || measure(`${quoted}, serif`) !== measure('serif');
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

// ── Apparition du texte (lettre par lettre, mot par mot) ─────────────────────────────────────

/** Part de la durée pendant laquelle une unité apparaît en douceur ; le reste sert à décaler les unités entre elles. */
export const GLYPH_WINDOW = 0.5;
/** Hauteur dont une unité monte en apparaissant, en part de la taille de la police. */
export const GLYPH_RISE = 0.35;

/**
 * Les unités qui apparaissent une à une dans une ligne : les lettres (un groupe de graphèmes, donc un accent ou un emoji reste entier) ou les mots. Les espaces ne sont pas des unités :
 * ils ne se voient pas, les compter ferait attendre dans le vide. Chaque unité donne ses bornes dans la ligne.
 * @param {string} line
 * @param {'chars' | 'words'} unit
 * @returns {{ start: number, end: number }[]}
 */
export function glyphUnits(line, unit) {
  /** @type {{ start: number, end: number }[]} */
  const units = [];
  if (unit === 'words') {
    for (const match of line.matchAll(/\S+/g)) units.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
    return units;
  }
  const pieces = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(line)].map(({ segment, index }) => ({ segment, index }))
    : Array.from(line).reduce((all, segment) => [...all, { segment, index: all.length === 0 ? 0 : all[all.length - 1].index + all[all.length - 1].segment.length }], /** @type {{ segment: string, index: number }[]} */ ([]));
  for (const { segment, index } of pieces) if (segment.trim() !== '') units.push({ start: index, end: index + segment.length });
  return units;
}

/**
 * L'état d'une unité pour une présence du texte donnée.
 * `hard` : l'unité est là ou n'y est pas (machine à écrire, et en sens inverse l'effacement depuis la fin).
 * `soft` : elle apparaît en fondu en montant, chaque unité un peu après la précédente.
 * @param {'hard' | 'soft'} reveal
 * @param {number} presence 0 (rien) à 1 (tout le texte)
 * @param {number} index le rang de l'unité dans tout le texte
 * @param {number} count le nombre d'unités du texte
 * @returns {{ alpha: number, rise: number }} `rise` : la hauteur restant à monter, en part de la taille de la police
 */
export function glyphLook(reveal, presence, index, count) {
  if (reveal === 'hard') return { alpha: presence * count > index ? 1 : 0, rise: 0 };
  const start = count > 1 ? (index / (count - 1)) * (1 - GLYPH_WINDOW) : 0;
  const local = Math.min(1, Math.max(0, (presence - start) / GLYPH_WINDOW));
  return { alpha: local, rise: (1 - local) ** 2 * GLYPH_RISE };
}
