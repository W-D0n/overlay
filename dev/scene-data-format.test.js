// @ts-check
import { test, expect } from 'bun:test';
import { addSceneToManifest, removeSceneFromManifest } from './scene-data-format.js';

test('addSceneToManifest adds a new id', () => {
  expect(addSceneToManifest([], 'ma-scene')).toEqual(['ma-scene']);
  expect(addSceneToManifest(['autre'], 'ma-scene')).toEqual(['autre', 'ma-scene']);
});

test('addSceneToManifest does not duplicate an existing id', () => {
  expect(addSceneToManifest(['ma-scene'], 'ma-scene')).toEqual(['ma-scene']);
});

test('addSceneToManifest does not mutate the input array', () => {
  const before = ['autre'];
  addSceneToManifest(before, 'ma-scene');
  expect(before).toEqual(['autre']);
});

test('removeSceneFromManifest removes an existing id', () => {
  expect(removeSceneFromManifest(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
});

test('removeSceneFromManifest is a no-op on an absent id', () => {
  expect(removeSceneFromManifest(['a', 'b'], 'nope')).toEqual(['a', 'b']);
});

test('removeSceneFromManifest does not mutate the input array', () => {
  const before = ['a', 'b'];
  removeSceneFromManifest(before, 'a');
  expect(before).toEqual(['a', 'b']);
});
