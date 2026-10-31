// @ts-check
/**
 * dev/test-images.js — Des en-têtes d'images minimaux pour les tests des assets : assez pour être reconnus et mesurés, pas pour être
 * décodés. Utilisé uniquement par les tests.
 */

/** @param {number} value @returns {number[]} */
const be32 = (value) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
/** @param {number} value @returns {number[]} */
const be16 = (value) => [(value >>> 8) & 255, value & 255];
/** @param {number} value @returns {number[]} */
const le16 = (value) => [value & 255, (value >>> 8) & 255];
/** @param {string} text @returns {number[]} */
const ascii = (text) => [...text].map((char) => char.charCodeAt(0));

/** @param {number} width @param {number} height @param {number} [padding] @returns {Uint8Array} */
export function pngBytes(width, height, padding = 8) {
  return Uint8Array.from([0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), ...ascii('IHDR'), ...be32(width), ...be32(height), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...new Array(padding).fill(0)]);
}

/** @param {number} width @param {number} height @returns {Uint8Array} */
export function gifBytes(width, height) {
  return Uint8Array.from([...ascii('GIF89a'), ...le16(width), ...le16(height), 0, 0, 0, 0x3b]);
}

/** Un JPEG dont un segment APP0 précède la trame de début (SOF0), comme dans un vrai fichier. @param {number} width @param {number} height @returns {Uint8Array} */
export function jpegBytes(width, height) {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...be16(16), ...ascii('JFIF'), 0, 1, 1, 0, ...be16(1), ...be16(1), 0, 0, 0xff, 0xc0, ...be16(17), 8, ...be16(height), ...be16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
}

/** @param {number} width @param {number} height @param {'lossy' | 'lossless' | 'extended'} [variant] @returns {Uint8Array} */
export function webpBytes(width, height, variant = 'extended') {
  /** @type {number[]} */
  let chunk;
  if (variant === 'lossy') chunk = [...ascii('VP8 '), 10, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(width), ...le16(height)];
  else if (variant === 'lossless') {
    const bits = (width - 1) | ((height - 1) << 14);
    chunk = [...ascii('VP8L'), 5, 0, 0, 0, 0x2f, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255];
  } else {
    chunk = [...ascii('VP8X'), 10, 0, 0, 0, 0, 0, 0, 0, (width - 1) & 255, ((width - 1) >>> 8) & 255, ((width - 1) >>> 16) & 255, (height - 1) & 255, ((height - 1) >>> 8) & 255, ((height - 1) >>> 16) & 255];
  }
  // Un vrai fichier WebP a toujours une charge utile : on complète pour atteindre la taille minimale d'un fichier plausible.
  while (12 + chunk.length < 40) chunk.push(0);
  const size = 4 + chunk.length;
  return Uint8Array.from([...ascii('RIFF'), size & 255, (size >>> 8) & 255, 0, 0, ...ascii('WEBP'), ...chunk]);
}
