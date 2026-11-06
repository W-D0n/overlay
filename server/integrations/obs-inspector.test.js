import { describe, expect, test } from 'bun:test';
import { inspectObs } from './obs-inspector.js';

/** Faux OBS : réponses par type de requête, journal des requêtes reçues. */
function fakeObs(responses) {
  const log = [];
  const request = async (type, data = {}) => {
    log.push({ type, data });
    const response = responses[type];
    if (response instanceof Error) throw response;
    return typeof response === 'function' ? response(data) : response;
  };
  return { request, log };
}

const BASE = {
  GetVersion: { obsVersion: '31.0.2' },
  GetSceneList: { scenes: [{ sceneName: 'Jeu' }, { sceneName: 'Pause' }] },
  GetInputList: { inputs: [{ inputName: 'Fond' }, { inputName: 'Alertes' }] },
  GetInputSettings: ({ inputName }) => ({ inputSettings: { url: inputName === 'Fond' ? 'http://localhost:5931/background.html?preset=x' : 'https://alerts.example/overlay?obs_pass=SECRET#frag' } }),
  GetSceneItemList: ({ sceneName }) => ({
    sceneItems: sceneName === 'Jeu'
      ? [{ sourceName: 'Fond', inputKind: 'browser_source', sceneItemEnabled: true }, { sourceName: 'Cam', inputKind: 'dshow_input', sceneItemEnabled: true }]
      : [{ sourceName: 'Fond', inputKind: 'browser_source', sceneItemEnabled: false }],
  }),
};

describe('inspectObs', () => {
  test('relève version, sources navigateur avec leur URL et leur présence par scène', async () => {
    const obs = fakeObs(BASE);
    const inspection = await inspectObs(obs.request);
    expect(inspection.obsVersion).toBe('31.0.2');
    expect(inspection.browserSources).toEqual([
      { name: 'Fond', url: 'http://localhost:5931/background.html' },
      { name: 'Alertes', url: 'https://alerts.example/overlay' },
    ]);
    expect(inspection.scenes).toEqual([
      { name: 'Jeu', browserSources: [{ name: 'Fond', enabled: true }] },
      { name: 'Pause', browserSources: [{ name: 'Fond', enabled: false }] },
    ]);
  });

  test('ne demande que des lectures', async () => {
    const obs = fakeObs(BASE);
    await inspectObs(obs.request);
    expect(obs.log.every(({ type }) => type.startsWith('Get'))).toBe(true);
  });

  test('ne demande les entrées qu’au type navigateur', async () => {
    const obs = fakeObs(BASE);
    await inspectObs(obs.request);
    expect(obs.log.find(({ type }) => type === 'GetInputList').data).toEqual({ inputKind: 'browser_source' });
  });

  test('une source illisible garde son nom avec une URL inconnue ; une scène illisible est vide', async () => {
    const obs = fakeObs({ ...BASE, GetInputSettings: new Error('boom'), GetSceneItemList: new Error('boom') });
    const inspection = await inspectObs(obs.request);
    expect(inspection.browserSources.map(({ url }) => url)).toEqual([null, null]);
    expect(inspection.scenes.every(({ browserSources }) => browserSources.length === 0)).toBe(true);
  });

  test('sans version lisible, le reste de l’inspection aboutit', async () => {
    const obs = fakeObs({ ...BASE, GetVersion: new Error('boom') });
    expect((await inspectObs(obs.request)).obsVersion).toBeNull();
  });

  test('sans liste de scènes, l’inspection échoue plutôt que de dire que tout est vide', async () => {
    const obs = fakeObs({ ...BASE, GetSceneList: new Error('OBS ne répond pas') });
    await expect(inspectObs(obs.request)).rejects.toThrow('OBS ne répond pas');
  });

  test('aucun paramètre d’URL ne sort de l’inspection, donc aucun mot de passe', async () => {
    const obs = fakeObs(BASE);
    const serialized = JSON.stringify(await inspectObs(obs.request));
    expect(serialized).not.toContain('SECRET');
    expect(serialized).not.toContain('obs_pass');
    expect(serialized).not.toContain('?');
  });
});
