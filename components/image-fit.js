// @ts-check
/**
 * components/image-fit.js — Où et comment poser une image dans la zone de sa couche : pur, sans canvas ni DOM.
 *
 * `contain` montre toute l'image, centrée, sans la déformer ; `cover` remplit la zone en rognant l'image (centrée) ; `fill`
 * l'étire aux dimensions de la zone. Le résultat est celui de `drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)`.
 *
 * @typedef {{ sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number }} ImageFit
 */

/**
 * @param {'contain' | 'cover' | 'fill'} mode
 * @param {{ width: number, height: number }} image dimensions naturelles de l'image
 * @param {{ width: number, height: number }} box zone disponible
 * @returns {ImageFit | null} `null` quand l'image ou la zone n'a aucune surface
 */
export function fitImage(mode, image, box) {
  if (!(image.width > 0 && image.height > 0 && box.width > 0 && box.height > 0)) return null;
  if (mode === 'fill') return { sx: 0, sy: 0, sw: image.width, sh: image.height, dx: 0, dy: 0, dw: box.width, dh: box.height };
  const imageRatio = image.width / image.height;
  const boxRatio = box.width / box.height;
  if (mode === 'cover') {
    // La zone est remplie : on ne garde de l'image que la part qui a le rapport de la zone, centrée.
    const sw = imageRatio > boxRatio ? image.height * boxRatio : image.width;
    const sh = imageRatio > boxRatio ? image.height : image.width / boxRatio;
    return { sx: (image.width - sw) / 2, sy: (image.height - sh) / 2, sw, sh, dx: 0, dy: 0, dw: box.width, dh: box.height };
  }
  const dw = imageRatio > boxRatio ? box.width : box.height * imageRatio;
  const dh = imageRatio > boxRatio ? box.width / imageRatio : box.height;
  return { sx: 0, sy: 0, sw: image.width, sh: image.height, dx: (box.width - dw) / 2, dy: (box.height - dh) / 2, dw, dh };
}

/**
 * Le placement (fractions de la toile) d'une image qu'on dépose dans une scène : à sa taille naturelle, ramenée si besoin pour tenir
 * dans 80 % de la toile sans déformation, et centrée. Ni plus grande que la toile ni minuscule : l'image est tout de suite lisible.
 * @param {{ width: number, height: number }} image
 * @param {{ width: number, height: number }} canvas la toile de référence
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function placementForImage(image, canvas) {
  const limit = 0.8;
  const scale = Math.min(1, (canvas.width * limit) / image.width, (canvas.height * limit) / image.height);
  const width = (image.width * scale) / canvas.width;
  const height = (image.height * scale) / canvas.height;
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}
