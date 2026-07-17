// @ts-check

/**
 * Forme normalisée consommée par le tuner. Le JSON reste volontairement facile à éditer à la main :
 * une couleur = `{ hex, oklch }`, un gradient = `{ color1, color2, ... }`, chaque stop étant soit
 * le nom d'une couleur, soit une couleur inline.
 *
 * @typedef {{ name: string, value: string, hex: string | null, oklch: string | null }} NamedColor
 * @typedef {{ name: string, colors: string[] }} NamedGradient
 */

/**
 * @param {unknown} raw
 * @returns {{ colors: NamedColor[], gradients: NamedGradient[] }}
 */
export function normalizeColorPalette(raw) {
  if (!isRecord(raw)) return { colors: [], gradients: [] };

  /** @type {NamedColor[]} */
  const colors = [];
  for (const [name, entry] of Object.entries(raw)) {
    const color = normalizeNamedColor(name, entry);
    if (color !== null) colors.push(color);
  }

  const byName = new Map(colors.map((color) => [color.name, color.value]));
  /** @type {NamedGradient[]} */
  const gradients = [];

  for (const [name, entry] of Object.entries(raw)) {
    if (!isRecord(entry) || normalizeNamedColor(name, entry) !== null) continue;

    const stops = Object.entries(entry)
      .filter(([key]) => /^color\d+$/.test(key))
      .sort(([a], [b]) => Number(a.slice(5)) - Number(b.slice(5)))
      .map(([, stop]) => normalizeGradientStop(stop, byName))
      .filter((value) => value !== null);

    if (stops.length >= 2) gradients.push({ name, colors: /** @type {string[]} */ (stops) });
  }

  return { colors, gradients };
}

/**
 * @param {string} name
 * @param {unknown} entry
 * @returns {NamedColor | null}
 */
function normalizeNamedColor(name, entry) {
  if (!isRecord(entry)) return null;
  const hex = nonEmptyString(entry.hex);
  const oklch = nonEmptyString(entry.oklch);
  if (hex === null && oklch === null) return null;
  return { name, value: hex ?? /** @type {string} */ (oklch), hex, oklch };
}

/**
 * @param {unknown} stop
 * @param {Map<string, string>} byName
 * @returns {string | null}
 */
function normalizeGradientStop(stop, byName) {
  if (typeof stop === 'string') return byName.get(stop) ?? null;
  return normalizeNamedColor('inline', stop)?.value ?? null;
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @returns {string | null} */
function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** @param {unknown} value @returns {value is string} */
export function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}
