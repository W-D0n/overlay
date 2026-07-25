// @ts-check
/**
 * obs-scene-mapping.js — Scène OBS active → preset de fond à appliquer.
 *
 * Logique pure : c'est ici que vivent les décisions, le client OBS ne fait que les appliquer.
 * Voir docs/specs/obs-scene-preset-mapping.md.
 *
 * @typedef {Record<string, string>} SceneMap - Nom de scène OBS → identifiant de preset
 */

/** @param {unknown} value */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Décide ce qu'une scène active déclenche. Ne lève jamais : une scène inconnue ou un preset
 * disparu sont des situations normales en live, pas des erreurs.
 *
 * @param {{ sceneName: unknown, sceneMap: SceneMap, presets: { id: string }[] }} input
 * @returns {{ preset: { id: string } | null, reason: null | 'unmapped' | 'missing-preset' }}
 */
export function resolveSceneMapping({ sceneName, sceneMap, presets }) {
  if (typeof sceneName !== 'string' || sceneName.length === 0) {
    return { preset: null, reason: 'unmapped' };
  }

  // Pas de normalisation (casse, espaces) : OBS distingue « Discussion » de « discussion », et
  // rapprocher les deux masquerait une faute de frappe au lieu de la rendre visible dans le tuner.
  const presetId = Object.hasOwn(sceneMap, sceneName) ? sceneMap[sceneName] : undefined;
  if (presetId === undefined) return { preset: null, reason: 'unmapped' };

  const preset = presets.find(({ id }) => id === presetId);
  if (preset === undefined) return { preset: null, reason: 'missing-preset' };

  return { preset, reason: null };
}

/**
 * Valide une table d'association avant écriture. Liste exhaustivement les entrées fautives —
 * même convention que les autres validateurs du projet.
 * @param {unknown} value
 * @returns {import('./types.js').ValidationResult}
 */
export function validateSceneMap(value) {
  if (!isPlainObject(value)) return { ok: false, errors: ['table des scènes : objet attendu'] };

  /** @type {string[]} */
  const errors = [];
  for (const [sceneName, presetId] of Object.entries(value)) {
    if (sceneName.length === 0) {
      errors.push('nom de scène : chaîne non vide attendue');
      continue;
    }
    if (typeof presetId !== 'string' || presetId.length === 0) {
      errors.push(`${sceneName} : identifiant de preset non vide attendu`);
    }
  }

  return { ok: errors.length === 0, errors };
}
