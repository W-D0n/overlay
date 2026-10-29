// @ts-check
/**
 * dev/obs-inspector.js — Photographie en lecture seule de ce qu'OBS contient, pour le diagnostic.
 *
 * Répond à : quelles sources navigateur existent, vers quelle URL pointent-elles, dans quelles scènes
 * sont-elles affichées ? Les requêtes passent par `request` (injecté) : l'inspection se teste sans OBS.
 * Les URL sont réduites à leur origine et leur chemin : les paramètres d'une source navigateur portent souvent des
 * mots de passe (overlays tiers qui se connectent à OBS), et le diagnostic n'en a pas besoin.
 * Les groupes et scènes imbriquées ne sont pas explorés : une source qui n'est qu'à l'intérieur d'un groupe
 * n'apparaît pas dans sa scène.
 *
 * @typedef {{ name: string, url: string | null, enabled: boolean }} ObsBrowserSource
 * @typedef {{ name: string, browserSources: { name: string, enabled: boolean }[] }} ObsSceneContent
 * @typedef {{
 *   obsVersion: string | null,
 *   scenes: ObsSceneContent[],
 *   browserSources: { name: string, url: string | null }[],
 * }} ObsInspection
 */

const BROWSER_KIND = 'browser_source';

/** @param {unknown} value @returns {string | null} origine + chemin, sans paramètres ni ancre ni identifiants */
function withoutSecrets(value) {
  if (typeof value !== 'string') return null;
  try {
    const { origin, pathname } = new URL(value);
    return origin === 'null' ? null : `${origin}${pathname}`;
  } catch {
    return null;
  }
}

/**
 * @param {(requestType: string, requestData?: Record<string, unknown>) => Promise<any>} request
 * @returns {Promise<ObsInspection>}
 */
export async function inspectObs(request) {
  const [version, sceneList, inputList] = await Promise.all([
    request('GetVersion').catch(() => ({})),
    request('GetSceneList'),
    request('GetInputList', { inputKind: BROWSER_KIND }),
  ]);

  const inputNames = /** @type {any[]} */ (inputList?.inputs ?? [])
    .map((input) => input?.inputName)
    .filter((name) => typeof name === 'string');
  const browserSources = await Promise.all(inputNames.map(async (name) => {
    const settings = await request('GetInputSettings', { inputName: name }).catch(() => null);
    return { name, url: withoutSecrets(settings?.inputSettings?.url) };
  }));

  const sceneNames = /** @type {any[]} */ (sceneList?.scenes ?? [])
    .map((scene) => scene?.sceneName)
    .filter((name) => typeof name === 'string');
  const scenes = await Promise.all(sceneNames.map(async (name) => {
    const items = await request('GetSceneItemList', { sceneName: name }).catch(() => null);
    const browserItems = /** @type {any[]} */ (items?.sceneItems ?? [])
      .filter((item) => item?.inputKind === BROWSER_KIND && typeof item?.sourceName === 'string')
      .map((item) => ({ name: /** @type {string} */ (item.sourceName), enabled: item.sceneItemEnabled !== false }));
    return { name, browserSources: browserItems };
  }));

  return {
    obsVersion: typeof version?.obsVersion === 'string' ? version.obsVersion : null,
    scenes,
    browserSources,
  };
}
