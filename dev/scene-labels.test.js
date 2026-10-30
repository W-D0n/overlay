import { describe, expect, test } from 'bun:test';
import { createLayer, sceneFromCurrent, sceneFromPreset } from '../scene-doc.js';
import { filterScenes, sceneDetails, sceneEffectsLabel } from './scene-labels.js';

const labelOf = (kind) => ({ rain: 'Pluie', bubble: 'Bulles', dotgrid: 'Grille de points', branding: 'Branding' })[kind] ?? kind;
const stack = (kinds, extra = {}) => ({ version: 1, id: 'pile', name: 'Pile du soir', layers: kinds.map((kind, index) => createLayer({ id: `l${index}`, kind })), ...extra });

describe('sceneEffectsLabel', () => {
  test('les effets du dessous au dessus ; le branding n’est pas un fond', () => {
    expect(sceneEffectsLabel(stack(['rain']), labelOf)).toBe('Pluie');
    expect(sceneEffectsLabel(stack(['rain', 'bubble', 'branding']), labelOf)).toBe('Pluie + Bulles');
  });

  test('sans effet : « Aucun fond »', () => {
    expect(sceneEffectsLabel(stack([]), labelOf)).toBe('Aucun fond');
    expect(sceneEffectsLabel(stack(['branding']), labelOf)).toBe('Aucun fond');
  });
});

describe('sceneDetails', () => {
  test('rien à signaler pour un effet seul avec son branding', () => {
    expect(sceneDetails(sceneFromCurrent({ component: 'rain', options: {} }))).toEqual([]);
  });

  test('plusieurs effets, transition, branding masqué', () => {
    expect(sceneDetails(stack(['rain', 'bubble']))).toEqual(['2 effets', 'sans branding']);
    const quiet = sceneFromPreset({ id: 'a', name: 'A', component: 'rain', options: {}, showBranding: false, transition: { type: 'wipe', durationMs: 300 } });
    expect(sceneDetails(quiet)).toEqual(['transition wipe', 'sans branding']);
  });
});

describe('filterScenes', () => {
  const scenes = [
    sceneFromPreset({ id: 'a', name: 'Café du matin', component: 'rain', options: {}, tags: ['calme'] }),
    stack(['dotgrid', 'bubble', 'branding']),
  ];

  test('requête vide : tout ; sinon nom, effet de n’importe quelle couche ou étiquette, sans casse ni accents', () => {
    expect(filterScenes(scenes, '  ', labelOf)).toBe(scenes);
    expect(filterScenes(scenes, 'CAFE', labelOf).map((s) => s.id)).toEqual(['a']);
    expect(filterScenes(scenes, 'bulles', labelOf).map((s) => s.id)).toEqual(['pile']);
    expect(filterScenes(scenes, 'pluie', labelOf).map((s) => s.id)).toEqual(['a']);
    expect(filterScenes(scenes, 'calme', labelOf).map((s) => s.id)).toEqual(['a']);
    expect(filterScenes(scenes, 'introuvable', labelOf)).toEqual([]);
  });

  test('le branding n’est pas un effet cherchable', () => {
    expect(filterScenes(scenes, 'branding', labelOf)).toEqual([]);
  });
});
