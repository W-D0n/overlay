// @ts-check
/**
 * dev/asset-library-view.js — Comment la médiathèque nomme ses images et ses polices : taille lisible, description d'une carte, tri des
 * fichiers déposés. Pur : testable sans navigateur.
 */
import { assetKind } from './asset-format.js';

/** @param {number} bytes @returns {string} « 340 Ko », « 2,4 Mo » */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  const kilo = bytes / 1024;
  if (kilo < 1024) return `${Math.round(kilo)} Ko`;
  return `${(kilo / 1024).toFixed(1).replace('.', ',')} Mo`;
}

/**
 * La ligne d'information d'un asset : dimensions (image) ou format (police), poids, usages.
 * @param {{ type?: string, width: number, height: number, bytes: number, uses: number }} asset
 * @returns {string}
 */
export function describeAsset(asset) {
  // Une image et une police sont féminines : « inutilisée », « utilisée 2 fois ».
  const uses = asset.uses === 0 ? 'inutilisée' : asset.uses === 1 ? 'utilisée 1 fois' : `utilisée ${asset.uses} fois`;
  const first = asset.type !== undefined && assetKind(asset.type) === 'font' ? `police ${asset.type.toUpperCase()}` : `${asset.width}×${asset.height}`;
  return `${first} · ${formatBytes(asset.bytes)} · ${uses}`;
}

/** Ce que le sélecteur de fichiers propose ; le serveur reste seul juge d'après l'en-tête du fichier. */
export const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/gif,image/webp';
export const ACCEPTED_FILE_TYPES = `${ACCEPTED_IMAGE_TYPES},.woff2,.woff,.ttf,.otf`;

/**
 * Parmi des fichiers déposés, ceux qu'on envoie au serveur (images, ou polices reconnues à leur extension : le navigateur ne leur donne souvent aucun
 * type), et ce qu'on écarte.
 * @template {{ name: string, type: string }} F
 * @param {readonly F[]} files
 * @returns {{ images: F[], ignored: number }}
 */
export function pickImageFiles(files) {
  const images = files.filter((file) => /^image\/(png|jpeg|gif|webp)$/.test(file.type) || /\.(woff2|woff|ttf|otf)$/i.test(file.name));
  return { images, ignored: files.length - images.length };
}

/**
 * Le message qui suit un import : combien d'éléments, combien déjà présents, combien refusés. « image » tant que tout est image, « fichier » dès
 * qu'une police s'y mêle.
 * @param {{ added: number, known: number, failed: string[], ignored: number, noun?: 'image' | 'fichier' }} outcome
 * @returns {string}
 */
export function summarizeImport({ added, known, failed, ignored, noun = 'image' }) {
  const parts = [];
  const feminine = noun === 'image';
  if (added > 0) parts.push(added === 1 ? `1 ${noun} importé${feminine ? 'e' : ''}` : `${added} ${noun}s importé${feminine ? 'e' : ''}s`);
  if (known > 0) parts.push(known === 1 ? `1 ${noun} était déjà là` : `${known} ${noun}s étaient déjà là`);
  if (ignored > 0) parts.push(ignored === 1 ? `1 fichier ignoré (ce n’est ni une image ni une police)` : `${ignored} fichiers ignorés (ni images ni polices)`);
  if (failed.length > 0) parts.push(`refusé : ${failed.join(' ; ')}`);
  return parts.length === 0 ? 'Aucun fichier à importer.' : `${parts.join(' · ')}.`;
}
