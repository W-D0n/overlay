// @ts-check
/**
 * dev/layer-clipboard.js — Le presse-papiers de couches du Studio : copier des couches (ou le style d'une couche) pour les
 * coller dans la même scène ou une autre, y compris d'un onglet à l'autre.
 *
 * Le contenu est du JSON validé (`validateSceneDoc` sur une scène d'enveloppe) : un presse-papiers corrompu ou venu d'ailleurs
 * est refusé, jamais collé à moitié. Il est gardé en mémoire et, quand le navigateur le permet, dans `localStorage` pour
 * survivre à un rechargement et se partager entre onglets de même origine.
 *
 * @typedef {import('../scene-doc.js').Layer} Layer
 * @typedef {{ kind: string, opacity: number, options: Record<string, unknown>, look?: Partial<Pick<Layer, 'blend' | 'rotation' | 'crop' | 'blur' | 'bindings' | 'timeline'>> }} LayerStyle
 */
import { LOOK_KEYS, validateSceneDoc } from '../scene-doc.js';

export const CLIPBOARD_FORMAT = 'overlay-layers';
const STORAGE_KEY = 'overlay.studio.clipboard';

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * @param {readonly Layer[]} layers
 * @returns {{ format: typeof CLIPBOARD_FORMAT, version: 1, layers: Layer[], style?: LayerStyle }}
 */
export function layersPayload(layers) {
  return { format: CLIPBOARD_FORMAT, version: 1, layers: structuredClone([...layers]) };
}

/**
 * Le style d'une couche : ce qui se colle sur une autre sans la déplacer ni la renommer.
 * @param {Layer} layer
 * @returns {LayerStyle}
 */
export function styleOf(layer) {
  const look = Object.fromEntries(LOOK_KEYS.filter((key) => layer[key] !== undefined).map((key) => [key, structuredClone(layer[key])]));
  return { kind: layer.kind, opacity: layer.opacity, options: structuredClone(layer.options), look };
}

/**
 * Lit et valide un contenu de presse-papiers.
 * @param {unknown} raw
 * @returns {{ ok: true, layers: Layer[], style: LayerStyle | null } | { ok: false, error: string }}
 */
export function parsePayload(raw) {
  /** @type {unknown} */
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'presse-papiers illisible' };
    }
  }
  if (!isRecord(value) || value.format !== CLIPBOARD_FORMAT || value.version !== 1) return { ok: false, error: 'ce n’est pas un presse-papiers de couches' };
  const layers = Array.isArray(value.layers) ? value.layers : [];
  const validation = validateSceneDoc({ version: 1, id: 'presse-papiers', name: 'presse-papiers', layers }, { allowEmpty: true });
  if (!validation.ok) return { ok: false, error: `couches invalides : ${validation.errors.join(' ; ')}` };
  const style = isRecord(value.style) && typeof value.style.kind === 'string' && typeof value.style.opacity === 'number' && isRecord(value.style.options)
    ? /** @type {LayerStyle} */ ({ kind: value.style.kind, opacity: value.style.opacity, options: value.style.options, look: isRecord(value.style.look) ? value.style.look : {} })
    : null;
  return { ok: true, layers: /** @type {Layer[]} */ (layers), style };
}

/**
 * @param {{ storage?: Pick<Storage, 'getItem' | 'setItem'> | null }} [options] `storage` : `null` pour ne garder qu'en mémoire
 */
export function createLayerClipboard({ storage = null } = {}) {
  /** @type {string | null} */
  let memory = null;

  /** @returns {string | null} */
  function read() {
    try {
      return storage?.getItem(STORAGE_KEY) ?? memory;
    } catch {
      return memory;
    }
  }

  /** @param {string} text */
  function write(text) {
    memory = text;
    try {
      storage?.setItem(STORAGE_KEY, text);
    } catch {
      // Stockage plein ou refusé : le contenu reste en mémoire pour cette session.
    }
  }

  return {
    /** Copie des couches (le style de la première reste disponible pour « coller le style »). @param {readonly Layer[]} layers */
    copy(layers) {
      if (layers.length === 0) return false;
      write(JSON.stringify({ ...layersPayload(layers), style: styleOf(layers[0]) }));
      return true;
    },

    /** Copie le style d'une couche seule, sans remplacer les couches copiées. @param {Layer} layer */
    copyStyle(layer) {
      const current = parsePayload(read());
      const layers = current.ok ? current.layers : [];
      write(JSON.stringify({ ...layersPayload(layers), style: styleOf(layer) }));
    },

    /** @returns {ReturnType<typeof parsePayload>} */
    read() {
      const text = read();
      return text === null ? { ok: false, error: 'rien n’a été copié' } : parsePayload(text);
    },

    /** Vrai s'il y a des couches à coller. */
    hasLayers() {
      const parsed = this.read();
      return parsed.ok && parsed.layers.length > 0;
    },

    /** Vrai s'il y a un style à coller. */
    hasStyle() {
      const parsed = this.read();
      return parsed.ok && parsed.style !== null;
    },
  };
}
