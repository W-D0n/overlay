// @ts-check
import { ASSET_ID_PATTERN, MAX_ASSET_BYTES, MAX_ASSET_NAME, collectAssetUsage, sanitizeAssetName, sniffAssetType } from './asset-format.js';

/**
 * dev/bundle-assets.js — Les images d'un lot d'export (version 4) : mise en base64 à l'export, lecture et contrôle à l'import. Pur.
 *
 * Un lot v4 porte `assets: [{ id, name, type, data }]`, `data` étant le fichier en base64. Une scène exportée avec ses images se
 * réimporte sur une autre machine sans « image manquante ». À l'import, rien n'est cru sur parole : la forme, le type (reconnu à
 * l'en-tête des octets décodés) et le nombre d'images sont contrôlés ici ; l'identifiant, lui, l'est par le serveur au moment de
 * l'envoi (le serveur calcule l'empreinte du contenu : un identifiant qui ne correspond pas est refusé par l'appelant).
 *
 * @typedef {{ id: string, name: string, type: import('./asset-format.js').AssetType, bytes: Uint8Array }} BundleAsset
 * @typedef {{ id: string, name: string, type: string, data: string }} PackedAsset
 */

export const MAX_BUNDLE_ASSETS = 64;
/** Poids total des images d'un lot : au-delà, un fichier de ce genre se partage autrement. */
export const MAX_BUNDLE_BYTES = 128 * 1024 * 1024;

const CHUNK = 0x8000;

/** @param {Uint8Array} bytes @returns {string} */
export function bytesToBase64(bytes) {
  let binary = '';
  for (let at = 0; at < bytes.length; at += CHUNK) binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  return btoa(binary);
}

/** @param {string} text @returns {Uint8Array} @throws {Error} si le texte n'est pas du base64 */
export function base64ToBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Les identifiants des images que des presets et des scènes utilisent, sans doublon.
 * @param {unknown} presets
 * @param {unknown} scenes
 * @returns {string[]}
 */
export function referencedAssetIds(presets, scenes) {
  return [...collectAssetUsage([presets, scenes]).keys()];
}

/**
 * @param {readonly { meta: { id: string, name: string, type: string }, bytes: Uint8Array }[]} entries
 * @returns {PackedAsset[]}
 */
export function packAssets(entries) {
  return entries.map(({ meta, bytes }) => ({ id: meta.id, name: meta.name, type: meta.type, data: bytesToBase64(bytes) }));
}

/**
 * Lit et contrôle les images d'un lot importé. Un lot sans `assets` n'en a aucune.
 * @param {unknown} raw
 * @returns {{ ok: true, assets: BundleAsset[] } | { ok: false, errors: string[] }}
 */
export function unpackAssets(raw) {
  if (raw === undefined) return { ok: true, assets: [] };
  if (!Array.isArray(raw)) return { ok: false, errors: ['assets : tableau attendu'] };
  if (raw.length > MAX_BUNDLE_ASSETS) return { ok: false, errors: [`assets : ${MAX_BUNDLE_ASSETS} images au plus par lot`] };
  /** @type {BundleAsset[]} */
  const assets = [];
  /** @type {string[]} */
  const errors = [];
  const seen = new Set();
  let total = 0;
  raw.forEach((entry, index) => {
    const where = `assets[${index}]`;
    if (typeof entry !== 'object' || entry === null) { errors.push(`${where} : objet attendu`); return; }
    const { id, name, data } = /** @type {Record<string, unknown>} */ (entry);
    if (typeof id !== 'string' || !ASSET_ID_PATTERN.test(id)) { errors.push(`${where}.id : identifiant d’image invalide`); return; }
    if (seen.has(id)) { errors.push(`${where}.id : image en double`); return; }
    seen.add(id);
    if (typeof data !== 'string' || data.length > Math.ceil((MAX_ASSET_BYTES * 4) / 3) + 4) { errors.push(`${where}.data : contenu manquant ou trop lourd`); return; }
    /** @type {Uint8Array} */
    let bytes;
    try {
      bytes = base64ToBytes(data);
    } catch {
      errors.push(`${where}.data : base64 illisible`);
      return;
    }
    const type = sniffAssetType(bytes);
    if (type === null) { errors.push(`${where} : ce n’est pas une image acceptée`); return; }
    total += bytes.length;
    assets.push({ id, name: sanitizeAssetName(typeof name === 'string' ? name.slice(0, MAX_ASSET_NAME) : ''), type, bytes });
  });
  if (total > MAX_BUNDLE_BYTES) errors.push(`assets : ${MAX_BUNDLE_BYTES / 1024 / 1024} Mo d’images au plus par lot`);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, assets };
}
