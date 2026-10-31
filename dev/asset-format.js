// @ts-check
import { ASSET_ID_PATTERN } from '../layer-kinds.js';

/**
 * dev/asset-format.js — Les assets d'image : reconnaissance du type, lecture des dimensions, limites, usages. Pur : octets en
 * entrée, décision en sortie, aucun accès au disque (`dev/asset-store.js`) ni au réseau (`dev/asset-routes.js`).
 *
 * Le type est reconnu à l'**en-tête du fichier**, jamais au nom ni à l'en-tête HTTP envoyés par le client : un fichier renommé
 * ne passe pas pour une image. Les images vectorielles (SVG) sont refusées : elles peuvent embarquer des scripts et des
 * références externes. Les dimensions sont lues sans décoder l'image, ce qui permet aussi de refuser une image démesurée avant
 * qu'un navigateur ne l'alloue.
 *
 * Les polices (WOFF2, WOFF, TrueType, OpenType) sont des assets comme les images : même magasin, même identifiant tiré du contenu, mêmes
 * routes. Leur type est reconnu de même à l'en-tête (jamais au nom) ; elles n'ont ni largeur ni hauteur (0), et un plafond de poids plus bas.
 *
 * @typedef {'png' | 'jpeg' | 'gif' | 'webp'} ImageType
 * @typedef {'woff2' | 'woff' | 'ttf' | 'otf'} FontType
 * @typedef {ImageType | FontType} AssetType
 * @typedef {{ id: string, name: string, type: AssetType, mime: string, bytes: number, width: number, height: number, addedAt: string }} AssetMeta
 */

/** Taille maximale d'un fichier. */
export const MAX_ASSET_BYTES = 15 * 1024 * 1024;
/** Surface maximale décodée (largeur × hauteur) : 25 millions de pixels, ≈ 100 Mo en mémoire une fois décodée. */
export const MAX_ASSET_PIXELS = 25_000_000;
/** Taille maximale d'un fichier de police. */
export const MAX_FONT_BYTES = 5 * 1024 * 1024;
/** Longueur maximale d'un nom d'asset. */
export const MAX_ASSET_NAME = 120;

export const ASSET_MIME = Object.freeze({ png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' });

const FONT_TYPES = new Set(['woff2', 'woff', 'ttf', 'otf']);

/** Les clés d'option qui désignent un asset : `asset` (une image), `fontAsset` (la police d'un texte). */
export const ASSET_OPTION_KEYS = Object.freeze(['asset', 'fontAsset']);

/** @param {string} type @returns {'image' | 'font'} la famille d'un type d'asset */
export function assetKind(type) {
  return FONT_TYPES.has(type) ? 'font' : 'image';
}

export { ASSET_ID_PATTERN };

/** @param {Uint8Array} bytes @param {string} text @param {number} [offset] */
function startsWith(bytes, text, offset = 0) {
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

/** @param {Uint8Array} bytes @param {number} at */
const u16be = (bytes, at) => (bytes[at] << 8) | bytes[at + 1];
/** @param {Uint8Array} bytes @param {number} at */
const u16le = (bytes, at) => bytes[at] | (bytes[at + 1] << 8);
/** @param {Uint8Array} bytes @param {number} at */
const u24le = (bytes, at) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
/** @param {Uint8Array} bytes @param {number} at */
const u32be = (bytes, at) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

/**
 * Le type d'un asset (image ou police) d'après son en-tête, ou `null`.
 * @param {Uint8Array} bytes
 * @returns {AssetType | null}
 */
export function sniffAssetType(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && startsWith(bytes, 'PNG\r\n\x1a\n', 1)) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 6 && (startsWith(bytes, 'GIF87a') || startsWith(bytes, 'GIF89a'))) return 'gif';
  if (bytes.length >= 12 && startsWith(bytes, 'RIFF') && startsWith(bytes, 'WEBP', 8)) return 'webp';
  if (bytes.length >= 12 && startsWith(bytes, 'wOF2')) return 'woff2';
  if (bytes.length >= 12 && startsWith(bytes, 'wOFF')) return 'woff';
  if (bytes.length >= 12 && startsWith(bytes, 'OTTO')) return 'otf';
  if (bytes.length >= 12 && ((bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) || startsWith(bytes, 'true'))) return 'ttf';
  return null;
}

/**
 * Les dimensions d'une image d'un type connu, lues dans ses en-têtes ; `null` si le fichier est tronqué ou incohérent.
 * @param {Uint8Array} bytes
 * @param {AssetType} type
 * @returns {{ width: number, height: number } | null}
 */
export function readAssetDimensions(bytes, type) {
  /** @type {{ width: number, height: number } | null} */
  let size = null;
  if (type === 'png' && bytes.length >= 24 && startsWith(bytes, 'IHDR', 12)) size = { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  else if (type === 'gif' && bytes.length >= 10) size = { width: u16le(bytes, 6), height: u16le(bytes, 8) };
  else if (type === 'jpeg') size = jpegSize(bytes);
  else if (type === 'webp') size = webpSize(bytes);
  return size !== null && size.width > 0 && size.height > 0 ? size : null;
}

/** @param {Uint8Array} bytes */
function jpegSize(bytes) {
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) { at += 1; continue; }
    const marker = bytes[at + 1];
    if (marker === 0xff) { at += 1; continue; }
    // Les marqueurs de début de trame (SOF) portent les dimensions ; DHT (c4), JPG (c8) et DAC (cc) n'en sont pas.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: u16be(bytes, at + 5), width: u16be(bytes, at + 7) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
    at += 2 + u16be(bytes, at + 2);
  }
  return null;
}

/** @param {Uint8Array} bytes */
function webpSize(bytes) {
  if (bytes.length < 30) return null;
  if (startsWith(bytes, 'VP8 ', 12)) return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
  if (startsWith(bytes, 'VP8L', 12)) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (startsWith(bytes, 'VP8X', 12)) return { width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
  return null;
}

/**
 * Un nom d'asset lisible : sans chemin, sans caractère de contrôle, borné ; « image » à défaut.
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeAssetName(raw) {
  const base = String(raw ?? '').split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_ASSET_NAME);
  return clean === '' ? 'image' : clean;
}

/**
 * Ce qu'un fichier reçu vaut comme asset : son type, ses dimensions, ou la raison du refus.
 * @param {Uint8Array} bytes
 * @returns {{ ok: true, type: AssetType, width: number, height: number } | { ok: false, error: string }}
 */
export function inspectAsset(bytes) {
  if (bytes.length === 0) return { ok: false, error: 'fichier vide' };
  if (bytes.length > MAX_ASSET_BYTES) return { ok: false, error: `fichier trop lourd (${MAX_ASSET_BYTES / 1024 / 1024} Mo au plus)` };
  const type = sniffAssetType(bytes);
  if (type === null) return { ok: false, error: 'format non pris en charge (images PNG, JPEG, GIF, WebP ; polices WOFF2, WOFF, TTF, OTF)' };
  if (assetKind(type) === 'font') {
    return bytes.length > MAX_FONT_BYTES ? { ok: false, error: `police trop lourde (${MAX_FONT_BYTES / 1024 / 1024} Mo au plus)` } : { ok: true, type, width: 0, height: 0 };
  }
  const size = readAssetDimensions(bytes, type);
  if (size === null) return { ok: false, error: 'image illisible ou tronquée' };
  if (size.width * size.height > MAX_ASSET_PIXELS) return { ok: false, error: `image trop grande (${size.width}×${size.height} ; ${MAX_ASSET_PIXELS / 1_000_000} millions de pixels au plus)` };
  return { ok: true, type, width: size.width, height: size.height };
}

/**
 * Les assets référencés par un document (fichier d'état, scène, brouillon…), avec le nombre de références : toute valeur
 * `asset` qui est un identifiant d'asset, où qu'elle soit.
 * @param {unknown} value
 * @param {Map<string, number>} [found]
 * @returns {Map<string, number>}
 */
export function collectAssetUsage(value, found = new Map()) {
  if (Array.isArray(value)) {
    for (const item of value) collectAssetUsage(item, found);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, nested] of Object.entries(value)) {
      if (ASSET_OPTION_KEYS.includes(key) && typeof nested === 'string' && ASSET_ID_PATTERN.test(nested)) found.set(nested, (found.get(nested) ?? 0) + 1);
      else collectAssetUsage(nested, found);
    }
  }
  return found;
}
