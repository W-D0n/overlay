// @ts-check
/**
 * dev/scene-placement-format.js — Réécriture ciblée d'un `placement` dans un `scenes/*.config.js`
 * (logique pure).
 *
 * N'écrit QUE la valeur `placement` d'une couche déjà migrée (S7 session 3/5) — ne sait pas insérer
 * un `placement` sur une couche qui n'en a pas encore (portée du panneau : déplacer, pas migrer).
 * Aucun effet de bord (pas de lecture/écriture disque ici — géré par `placement-server.js`).
 */

/**
 * @param {import('../types.js').Placement} placement
 * @returns {string}
 */
export function formatPlacementLiteral(placement) {
  const parts = [`x: ${placement.x}`, `y: ${placement.y}`];
  if (placement.width !== undefined) parts.push(`width: ${placement.width}`);
  if (placement.height !== undefined) parts.push(`height: ${placement.height}`);
  return `{ ${parts.join(', ')} }`;
}

/**
 * Remplacer la valeur `placement` de la couche `layerName` dans le code source d'un
 * `scenes/*.config.js`. La couche doit déjà avoir un `placement` existant (pas d'insertion).
 *
 * @param {string} sourceCode
 * @param {string} layerName
 * @param {import('../types.js').Placement} placement
 * @returns {string}
 * @throws {Error} Si la couche ou son `placement` existant sont introuvables
 */
export function applyPlacementToLayerSource(sourceCode, layerName, placement) {
  const escapedName = layerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const layerBlockRegex = new RegExp(`(name: '${escapedName}',[\\s\\S]*?placement: )\\{[^}]*\\}`);

  if (!layerBlockRegex.test(sourceCode)) {
    throw new Error(`placement introuvable pour la couche "${layerName}" — pas encore migrée, ou nom incorrect.`);
  }

  return sourceCode.replace(layerBlockRegex, (_match, prefix) => `${prefix}${formatPlacementLiteral(placement)}`);
}
