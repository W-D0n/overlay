// @ts-check
import { test, expect } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { buildSceneMap, formatObsSceneMapDataFile } from './obs-scene-map-format.js';

test('buildSceneMap construit un objet obsName -> sceneId', () => {
  expect(buildSceneMap([{ obsName: 'Just Chatting', sceneId: 'discussion' }, { obsName: 'BRB', sceneId: 'brb' }]))
    .toEqual({ 'Just Chatting': 'discussion', BRB: 'brb' });
});

test('buildSceneMap retourne un objet vide pour une liste vide', () => {
  expect(buildSceneMap([])).toEqual({});
});

test('buildSceneMap ignore les entrées avec un nom OBS vide/espaces', () => {
  expect(buildSceneMap([{ obsName: '  ', sceneId: 'discussion' }, { obsName: 'BRB', sceneId: 'brb' }]))
    .toEqual({ BRB: 'brb' });
});

test('buildSceneMap trim les noms OBS (espaces superflus)', () => {
  expect(buildSceneMap([{ obsName: '  Just Chatting  ', sceneId: 'discussion' }]))
    .toEqual({ 'Just Chatting': 'discussion' });
});

test('buildSceneMap ne mute pas le tableau original', () => {
  const entries = [{ obsName: 'BRB', sceneId: 'brb' }];
  const copy = JSON.parse(JSON.stringify(entries));
  buildSceneMap(entries);
  expect(entries).toEqual(copy);
});

test('formatObsSceneMapDataFile produit un module JS valide et ré-importable (round-trip réel)', async () => {
  const map = { 'Mon Chat': 'discussion', 'Ma Pause': 'brb' };
  const source = formatObsSceneMapDataFile(map);

  const dir = mkdtempSync(`${tmpdir()}/obs-scene-map-test-`);
  const file = `${dir}/obs-scene-map-data.js`;
  await Bun.write(file, source);
  try {
    const mod = await import(file);
    expect(mod.OBS_SCENE_MAP).toEqual(map);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('formatObsSceneMapDataFile échappe correctement les guillemets dans un nom OBS', async () => {
  const map = { 'Scène "spéciale"': 'brb' };
  const source = formatObsSceneMapDataFile(map);

  const dir = mkdtempSync(`${tmpdir()}/obs-scene-map-test-`);
  const file = `${dir}/obs-scene-map-data.js`;
  await Bun.write(file, source);
  try {
    const mod = await import(file);
    expect(mod.OBS_SCENE_MAP).toEqual(map);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
