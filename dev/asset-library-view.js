// @ts-check
/**
 * dev/asset-library-view.js — Comment la médiathèque nomme ses images : taille lisible, description d'une carte, tri des fichiers
 * déposés. Pur : testable sans navigateur.
 */

/** @param {number} bytes @returns {string} « 340 Ko », « 2,4 Mo » */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  const kilo = bytes / 1024;
  if (kilo < 1024) return `${Math.round(kilo)} Ko`;
  return `${(kilo / 1024).toFixed(1).replace('.', ',')} Mo`;
}

/**
 * La ligne d'information d'une image : dimensions, poids, usages.
 * @param {{ width: number, height: number, bytes: number, uses: number }} asset
 * @returns {string}
 */
export function describeAsset(asset) {
  const uses = asset.uses === 0 ? 'inutilisée' : asset.uses === 1 ? 'utilisée 1 fois' : `utilisée ${asset.uses} fois`;
  return `${asset.width}×${asset.height} · ${formatBytes(asset.bytes)} · ${uses}`;
}

/** Les types d'image que le sélecteur de fichiers propose ; le serveur reste seul juge d'après l'en-tête du fichier. */
export const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/gif,image/webp';

/**
 * Parmi des fichiers déposés, ceux qu'on envoie au serveur (images), et ce qu'on écarte.
 * @template {{ name: string, type: string }} F
 * @param {readonly F[]} files
 * @returns {{ images: F[], ignored: number }}
 */
export function pickImageFiles(files) {
  const images = files.filter((file) => /^image\/(png|jpeg|gif|webp)$/.test(file.type));
  return { images, ignored: files.length - images.length };
}

/**
 * Le message qui suit un import : combien d'images, combien déjà présentes, combien refusées.
 * @param {{ added: number, known: number, failed: string[], ignored: number }} outcome
 * @returns {string}
 */
export function summarizeImport({ added, known, failed, ignored }) {
  const parts = [];
  if (added > 0) parts.push(added === 1 ? '1 image importée' : `${added} images importées`);
  if (known > 0) parts.push(known === 1 ? '1 image était déjà là' : `${known} images étaient déjà là`);
  if (ignored > 0) parts.push(ignored === 1 ? '1 fichier ignoré (ce n’est pas une image)' : `${ignored} fichiers ignorés (pas des images)`);
  if (failed.length > 0) parts.push(`refusé : ${failed.join(' ; ')}`);
  return parts.length === 0 ? 'Aucun fichier à importer.' : `${parts.join(' · ')}.`;
}
