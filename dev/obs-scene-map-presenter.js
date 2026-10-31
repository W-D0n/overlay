// @ts-check
/**
 * dev/obs-scene-map-presenter.js — Ce que la section « Scènes OBS » du tuner doit afficher.
 *
 * Logique pure, séparée du DOM : les décisions d'affichage (quelles lignes, quel avertissement,
 * quel message de connexion) se testent sans navigateur ni OBS.
 * Voir docs/specs/obs-scene-preset-mapping.md.
 *
 * @typedef {{ connected: boolean, configured: boolean, reason: string | null, scenes: string[], activeScene?: string | null }} ObsStatus
 * @typedef {{ sceneName: string, presetId: string | null, missingPreset: boolean, knownByObs: boolean, active: boolean }} SceneRow
 */

/**
 * Lignes à afficher : les scènes réellement présentes dans OBS, plus celles déjà associées mais
 * absentes de la liste (OBS fermé, ou scène renommée depuis) — sinon une association disparaîtrait
 * de l'écran sans jamais pouvoir être corrigée. Ordre : scène active, scènes associées, puis les
 * autres, chacune dans l'ordre d'OBS.
 *
 * @param {{ status: ObsStatus, sceneMap: Record<string, string>, presets: { id: string }[] }} input
 * @returns {SceneRow[]}
 */
export function sceneRows({ status, sceneMap, presets }) {
  const fromObs = status.scenes;
  const mappedOnly = Object.keys(sceneMap).filter((name) => !fromObs.includes(name));
  const activeScene = status.activeScene ?? null;

  /** @type {SceneRow[]} */
  const rows = [...fromObs, ...mappedOnly].map((sceneName) => {
    const presetId = Object.hasOwn(sceneMap, sceneName) ? sceneMap[sceneName] : null;
    return {
      sceneName,
      presetId,
      missingPreset: presetId !== null && !presets.some(({ id }) => id === presetId),
      knownByObs: fromObs.includes(sceneName),
      active: sceneName === activeScene,
    };
  });
  /** @param {SceneRow} row */
  const rank = (row) => (row.active ? 0 : row.presetId !== null ? 1 : 2);
  return rows.map((row, index) => ({ row, index }))
    .sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index)
    .map(({ row }) => row);
}

/** @param {string} text */
function searchKey(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Lignes dont le nom contient le texte saisi (sans tenir compte de la casse ni des accents).
 * @param {SceneRow[]} rows
 * @param {string} text
 * @returns {SceneRow[]}
 */
export function filterSceneRows(rows, text) {
  const key = searchKey(text.trim());
  if (key === '') return rows;
  return rows.filter(({ sceneName }) => searchKey(sceneName).includes(key));
}

/**
 * Sépare les scènes à montrer (active ou associée) de celles repliées sous un compteur (sans preset).
 * @param {SceneRow[]} rows
 * @returns {{ shown: SceneRow[], folded: SceneRow[] }}
 */
export function partitionSceneRows(rows) {
  const shown = rows.filter((row) => row.active || row.presetId !== null);
  const folded = rows.filter((row) => !row.active && row.presetId === null);
  return { shown, folded };
}

/**
 * Message d'état de la connexion OBS, en langage utilisateur — jamais un code technique brut.
 * @param {ObsStatus} status
 * @returns {{ tone: 'ready' | 'attention', text: string }}
 */
export function obsStatusMessage(status) {
  if (!status.configured) {
    return {
      tone: 'attention',
      text: 'Non configuré — renseigne le mot de passe OBS dans Réglages.',
    };
  }
  if (status.connected) {
    return { tone: 'ready', text: `Connecté à OBS — ${status.scenes.length} scène(s) détectée(s).` };
  }
  if (status.reason === 'auth-rejected') {
    return {
      tone: 'attention',
      text: 'Mot de passe refusé par OBS — corrige-le dans Réglages.',
    };
  }
  if (status.reason === 'connecting') return { tone: 'attention', text: 'Connexion à OBS en cours…' };
  return { tone: 'attention', text: 'OBS injoignable — les associations enregistrées restent modifiables.' };
}

/**
 * Table à enregistrer à partir des choix affichés. Une ligne sans preset sort de la table plutôt
 * que d'y rester avec une valeur vide : la table ne décrit que des associations réelles.
 * @param {{ sceneName: string, presetId: string | null }[]} rows
 * @returns {Record<string, string>}
 */
export function sceneMapFromRows(rows) {
  /** @type {Record<string, string>} */
  const sceneMap = {};
  for (const { sceneName, presetId } of rows) {
    if (typeof presetId === 'string' && presetId.length > 0) sceneMap[sceneName] = presetId;
  }
  return sceneMap;
}
