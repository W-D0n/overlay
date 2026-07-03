// @ts-check
import { test, expect } from 'bun:test';
import { mapObsSceneToOverlaySceneId, OBS_SCENE_MAP } from './obs-scene-map.js';

test('mapObsSceneToOverlaySceneId returns the mapped SceneId for a known OBS scene name', () => {
  expect(mapObsSceneToOverlaySceneId('Just Chatting')).toBe('discussion');
  expect(mapObsSceneToOverlaySceneId('BRB')).toBe('brb');
});

test('mapObsSceneToOverlaySceneId returns null for an unknown OBS scene name', () => {
  expect(mapObsSceneToOverlaySceneId('Scène Inconnue')).toBeNull();
});

test('mapObsSceneToOverlaySceneId returns null for an empty string', () => {
  expect(mapObsSceneToOverlaySceneId('')).toBeNull();
});

test('mapObsSceneToOverlaySceneId never returns a value outside SceneId, even with a corrupted map', () => {
  const corruptedMap = { ...OBS_SCENE_MAP, Rogue: 'not-a-real-scene-id' };
  expect(mapObsSceneToOverlaySceneId('Rogue', corruptedMap)).toBeNull();
});

test('mapObsSceneToOverlaySceneId covers the 4 OBS scenes actually configured', () => {
  const mapped = Object.keys(OBS_SCENE_MAP).map((name) => mapObsSceneToOverlaySceneId(name));
  expect(mapped.sort()).toEqual(['brb', 'codage', 'discussion', 'jeu'].sort());
});
