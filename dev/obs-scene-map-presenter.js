// @ts-check
/**
 * dev/obs-scene-map-presenter.js — Ce que la section « Scènes OBS » du tuner doit afficher.
 *
 * Logique pure, séparée du DOM : les décisions d'affichage (quelles lignes, quel avertissement,
 * quel message de connexion) se testent sans navigateur ni OBS.
 * Voir docs/specs/obs-scene-preset-mapping.md.
 *
 * @typedef {{ connected: boolean, configured: boolean, reason: string | null, scenes: string[] }} ObsStatus
 * @typedef {{ sceneName: string, presetId: string | null, missingPreset: boolean, knownByObs: boolean }} SceneRow
 */

/**
 * Lignes à afficher : les scènes réellement présentes dans OBS, plus celles déjà associées mais
 * absentes de la liste (OBS fermé, ou scène renommée depuis) — sinon une association disparaîtrait
 * de l'écran sans jamais pouvoir être corrigée.
 *
 * @param {{ status: ObsStatus, sceneMap: Record<string, string>, presets: { id: string }[] }} input
 * @returns {SceneRow[]}
 */
export function sceneRows({ status, sceneMap, presets }) {
  const fromObs = status.scenes;
  const mappedOnly = Object.keys(sceneMap).filter((name) => !fromObs.includes(name));

  return [...fromObs, ...mappedOnly].map((sceneName) => {
    const presetId = Object.hasOwn(sceneMap, sceneName) ? sceneMap[sceneName] : null;
    return {
      sceneName,
      presetId,
      missingPreset: presetId !== null && !presets.some(({ id }) => id === presetId),
      knownByObs: fromObs.includes(sceneName),
    };
  });
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
      text: 'Non configuré — renseigne OBS_WS_URL et OBS_WS_PASSWORD dans .env, puis relance le serveur d’état.',
    };
  }
  if (status.connected) {
    return { tone: 'ready', text: `Connecté à OBS — ${status.scenes.length} scène(s) détectée(s).` };
  }
  if (status.reason === 'auth-rejected') {
    return {
      tone: 'attention',
      text: 'Mot de passe refusé par OBS — corrige OBS_WS_PASSWORD puis relance le serveur d’état.',
    };
  }
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
