// @ts-check
import { test, expect } from 'bun:test';
import { addSceneToManifest, removeSceneFromManifest, pushHistoryEntry } from './scene-data-format.js';

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

/** @type {(t: number) => { timestamp: number, sceneConfig: * }} */
const entry = (t) => ({ timestamp: t, sceneConfig: { id: 'x', dotgridMode: null, transition: {}, layers: [] } });

test('pushHistoryEntry on an empty history makes the first entry the origin', () => {
  expect(pushHistoryEntry([], entry(1))).toEqual([entry(1)]);
});

test('pushHistoryEntry appends without trimming under the window size', () => {
  const history = [entry(1), entry(2)];
  expect(pushHistoryEntry(history, entry(3))).toEqual([entry(1), entry(2), entry(3)]);
});

test('pushHistoryEntry never evicts the origin (history[0]), even once the window is full', () => {
  const history = [entry(0), ...Array.from({ length: 100 }, (_, i) => entry(i + 1))];
  const result = pushHistoryEntry(history, entry(101));
  expect(result[0]).toEqual(entry(0)); // origine toujours présente
  expect(result.length).toBe(101); // origine + 100 (fenêtre glissante, la plus ancienne des 100 a été purgée)
  expect(result.at(-1)).toEqual(entry(101));
  expect(result).not.toContainEqual(entry(1)); // la plus ancienne de la fenêtre glissante a été évincée
});

test('pushHistoryEntry does not mutate the input array', () => {
  const before = [entry(1), entry(2)];
  const beforeCopy = JSON.stringify(before);
  pushHistoryEntry(before, entry(3));
  expect(JSON.stringify(before)).toBe(beforeCopy);
});
