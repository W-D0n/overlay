// @ts-check
import { expect, test } from 'bun:test';
import { obsStatusMessage, sceneMapFromRows, sceneRows } from './obs-scene-map-presenter.js';

const presets = [{ id: 'discussion-calme' }, { id: 'ambiance-nuit' }];
const connected = { connected: true, configured: true, reason: null, scenes: ['Discussion', 'BRB'] };

test('1. chaque scène OBS produit une ligne, associée ou non', () => {
  const rows = sceneRows({ status: connected, sceneMap: { Discussion: 'discussion-calme' }, presets });
  expect(rows).toEqual([
    { sceneName: 'Discussion', presetId: 'discussion-calme', missingPreset: false, knownByObs: true },
    { sceneName: 'BRB', presetId: null, missingPreset: false, knownByObs: true },
  ]);
});

test('2. une association vers un preset supprimé est signalée, pas effacée', () => {
  const rows = sceneRows({ status: connected, sceneMap: { Discussion: 'preset-efface' }, presets });
  expect(rows[0].missingPreset).toBe(true);
  expect(rows[0].presetId).toBe('preset-efface');
});

test('3. une scène associée mais absente d’OBS reste affichée et corrigeable', () => {
  const rows = sceneRows({
    status: { ...connected, scenes: ['Discussion'] },
    sceneMap: { Discussion: 'discussion-calme', 'Ancienne scène': 'ambiance-nuit' },
    presets,
  });
  expect(rows.map(({ sceneName }) => sceneName)).toEqual(['Discussion', 'Ancienne scène']);
  expect(rows[1].knownByObs).toBe(false);
});

test('4. OBS injoignable : seules les associations enregistrées sont listées', () => {
  const rows = sceneRows({
    status: { connected: false, configured: true, reason: 'closed', scenes: [] },
    sceneMap: { Discussion: 'discussion-calme' },
    presets,
  });
  expect(rows).toEqual([
    { sceneName: 'Discussion', presetId: 'discussion-calme', missingPreset: false, knownByObs: false },
  ]);
});

test('5. aucune scène et aucune association → aucune ligne', () => {
  const rows = sceneRows({
    status: { connected: true, configured: true, reason: null, scenes: [] },
    sceneMap: {},
    presets,
  });
  expect(rows).toEqual([]);
});

test('6. le message d’état nomme les variables quand rien n’est configuré', () => {
  const message = obsStatusMessage({ connected: false, configured: false, reason: 'not-configured', scenes: [] });
  expect(message.tone).toBe('attention');
  expect(message.text).toContain('OBS_WS_PASSWORD');
});

test('7. connecté annonce le nombre de scènes', () => {
  expect(obsStatusMessage(connected)).toEqual({
    tone: 'ready',
    text: 'Connecté à OBS — 2 scène(s) détectée(s).',
  });
});

test('8. un mot de passe refusé est distingué d’un OBS fermé', () => {
  const rejected = obsStatusMessage({ connected: false, configured: true, reason: 'auth-rejected', scenes: [] });
  const closed = obsStatusMessage({ connected: false, configured: true, reason: 'closed', scenes: [] });
  expect(rejected.text).toContain('Mot de passe refusé');
  expect(closed.text).toContain('injoignable');
});

test('9. les lignes sans preset sortent de la table enregistrée', () => {
  const sceneMap = sceneMapFromRows([
    { sceneName: 'Discussion', presetId: 'discussion-calme' },
    { sceneName: 'BRB', presetId: null },
    { sceneName: 'Jeu', presetId: '' },
  ]);
  expect(sceneMap).toEqual({ Discussion: 'discussion-calme' });
});

test('10. une table sans aucune association est un objet vide, pas null', () => {
  expect(sceneMapFromRows([{ sceneName: 'BRB', presetId: null }])).toEqual({});
});
