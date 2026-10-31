import { describe, expect, test } from 'bun:test';
import { createLayer } from '../scene-doc.js';
import { createSceneEditor } from './scene-editor.js';
import { describeRestoration, describeVersion, formatVersionDate } from './version-view.js';
import { operationToStep } from './operation-steps.js';
import { createVersionClient } from './version-client.js';

const scene = (layers, extra = {}) => ({ version: 1, id: 'nuit', name: 'Nuit', tags: ['calme'], layers, ...extra });
const effect = (id, kind = 'rain', over = {}) => createLayer({ id, kind, ...over });
const labelOf = (kind) => ({ rain: 'Pluie', bubble: 'Bulles', text: 'Texte', branding: 'Branding' })[kind] ?? kind;

describe('editor.restoreVersion', () => {
  test('remplace les couches et la transition, garde le nom, l’identité et les étiquettes, vide la sélection, en une seule entrée annulable', () => {
    const editor = createSceneEditor({ scene: scene([effect('a'), effect('b', 'bubble')], { name: 'Ma scène', transition: { type: 'fade', durationMs: 500 } }) });
    editor.select(['a']);
    const version = scene([effect('x', 'text', { rotation: 5 })], { id: 'autre', name: 'Ancien nom', tags: ['autre'], transition: { type: 'wipe', durationMs: 300 } });
    expect(editor.restoreVersion(version, 'Restaurer la version « v »').ok).toBe(true);
    const state = editor.state();
    expect(state.scene.layers.map((layer) => layer.id)).toEqual(['x']);
    expect(state.scene.layers[0].rotation).toBe(5);
    expect(state.scene).toMatchObject({ id: 'nuit', name: 'Ma scène', tags: ['calme'], transition: { type: 'wipe', durationMs: 300 } });
    expect(state.selection).toEqual([]);
    expect(state.undoLabel).toBe('Restaurer la version « v »');
    editor.undo();
    expect(editor.state().scene.layers.map((layer) => layer.id)).toEqual(['a', 'b']);
    expect(editor.state().scene.transition).toMatchObject({ type: 'fade' });
    expect(editor.state().canUndo).toBe(false);
  });

  test('une version sans transition retire celle de la scène', () => {
    const editor = createSceneEditor({ scene: scene([effect('a')], { transition: { type: 'fade', durationMs: 500 } }) });
    editor.restoreVersion(scene([effect('a', 'bubble')]));
    expect('transition' in editor.state().scene).toBe(false);
  });

  test('restaurer une scène identique n’ajoute aucune entrée d’historique', () => {
    const editor = createSceneEditor({ scene: scene([effect('a')]) });
    expect(editor.restoreVersion(scene([effect('a')])).ok).toBe(true);
    expect(editor.state().canUndo).toBe(false);
  });

  test('la version gardée n’est pas partagée avec la scène (copie)', () => {
    const editor = createSceneEditor({ scene: scene([effect('a')]) });
    const version = scene([effect('x', 'rain', { options: { speed: 1 } })]);
    editor.restoreVersion(version);
    editor.setOptions('x', { speed: 9 });
    expect(version.layers[0].options.speed).toBe(1);
  });

  test('une version qui rendrait la scène invalide est refusée, la scène reste', () => {
    const editor = createSceneEditor({ scene: scene([effect('a')]) });
    const result = editor.restoreVersion(scene(Array.from({ length: 9 }, (_, index) => effect(`c${index}`))));
    expect(result.ok).toBe(false);
    expect(editor.state().scene.layers.map((layer) => layer.id)).toEqual(['a']);
  });

  test('une macro enregistrée n’emporte pas la restauration, et le dit', () => {
    const editor = createSceneEditor({ scene: scene([effect('a')]) });
    const seen = [];
    editor.onOperation((operation) => seen.push(operation));
    editor.restoreVersion(scene([effect('b', 'bubble')]));
    expect(seen.map(({ op }) => op)).toEqual(['restoreVersion']);
    expect(operationToStep(seen[0], { kindOf: () => 'rain' })).toMatchObject({ skipped: expect.stringContaining('restauration') });
  });
});

describe('vue des versions', () => {
  test('formatVersionDate : jour/mois/année heure:minute, tiret pour une date illisible', () => {
    expect(formatVersionDate(new Date(2026, 9, 31, 14, 5).toISOString())).toBe('31/10/2026 14:05');
    expect(formatVersionDate('hier')).toBe('—');
  });

  test('describeVersion : nombre de couches et premières couches, nom propre avant libellé', () => {
    expect(describeVersion(scene([effect('a'), effect('t', 'text', { name: 'Titre' })]), labelOf)).toBe('2 couches : Pluie, Titre');
    expect(describeVersion(scene([effect('a')]), labelOf)).toBe('1 couche : Pluie');
    expect(describeVersion(scene([]), labelOf)).toBe('aucune couche');
    expect(describeVersion(scene(Array.from({ length: 6 }, (_, index) => effect(`c${index}`))), labelOf)).toBe('6 couches : Pluie, Pluie, Pluie, Pluie…');
  });

  test('describeRestoration : ce qui change si on restaure', () => {
    const current = scene([effect('a'), effect('b', 'bubble')]);
    expect(describeRestoration(scene([effect('a'), effect('b', 'bubble')]), current)).toBe('identique à la scène en cours');
    expect(describeRestoration(scene([effect('a')]), current)).toBe('retire 1 couche par rapport à la scène en cours');
    expect(describeRestoration(scene([effect('a'), effect('b'), effect('c'), effect('d')]), current)).toBe('ajoute 2 couches par rapport à la scène en cours');
    expect(describeRestoration(scene([effect('a'), effect('t', 'text')]), current)).toBe('ajoute 1 contenu');
    expect(describeRestoration(scene([effect('a', 'rain', { opacity: 0.5 }), effect('b', 'bubble')]), current)).toBe('même nombre de couches, réglages différents');
  });
});

describe('client des versions', () => {
  function fakeFetch(...responses) {
    const calls = [];
    return { calls, fetchImpl: async (url, init) => { calls.push({ url, init }); return responses.shift(); } };
  }
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

  test('liste par scène, enregistre, renomme, supprime', async () => {
    const { fetchImpl, calls } = fakeFetch(json({ versions: [{ id: 'v1' }] }), json({ version: { id: 'v2' } }, 201), json({ version: { id: 'v2', name: 'B' } }), json({ ok: true }));
    const client = createVersionClient({ baseUrl: 'http://x/', fetchImpl });
    expect(await client.list('a b')).toEqual([{ id: 'v1' }]);
    expect(calls[0].url).toBe('http://x/versions?scene=a%20b');
    expect(await client.add({ id: 'nuit' }, 'A')).toEqual({ id: 'v2' });
    expect(JSON.parse(calls[1].init.body)).toEqual({ scene: { id: 'nuit' }, name: 'A' });
    expect((await client.rename('v2', 'B')).name).toBe('B');
    expect(calls[2].url).toBe('http://x/versions/rename');
    await client.remove('v2');
    expect(calls[3]).toMatchObject({ url: 'http://x/versions/v2', init: { method: 'DELETE' } });
  });

  test('une erreur du serveur sort avec son message et son statut', async () => {
    const { fetchImpl } = fakeFetch(json({ error: 'une version s’appelle déjà « A »' }, 409));
    const failure = await createVersionClient({ baseUrl: 'http://x', fetchImpl }).add({}, 'A').catch((error) => error);
    expect(failure.message).toBe('une version s’appelle déjà « A »');
    expect(failure.status).toBe(409);
  });
});
