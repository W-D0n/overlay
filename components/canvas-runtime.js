// @ts-check

/**
 * Ratio de pixels partagé par les canvas animés. Le plafond évite de rendre 4× plus de pixels
 * sur les écrans HiDPI ; `?quality=performance` force un rendu 1× adapté à OBS.
 * @param {number} [deviceRatio]
 * @param {string} [search]
 */
export function canvasPixelRatio(
  deviceRatio = globalThis.window?.devicePixelRatio ?? 1,
  search = globalThis.location?.search ?? '',
) {
  const safeRatio = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  const cap = new URLSearchParams(search).get('quality') === 'performance' ? 1 : 2;
  return Math.min(safeRatio, cap);
}
