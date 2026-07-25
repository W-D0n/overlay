// @ts-check
import { expect, test } from 'bun:test';
import { resolveSceneMapping, validateSceneMap } from './obs-scene-mapping.js';

const presets = [
  { id: 'discussion-calme', name: 'Discussion calme', component: 'BubbleBackground', options: {} },
  { id: 'ambiance-nuit', name: 'Ambiance nuit', component: 'StarsParallaxBackground', options: {} },
];

const sceneMap = { Discussion: 'discussion-calme', BRB: 'ambiance-nuit' };

test('1. une scène associée résout vers son preset', () => {
  const result = resolveSceneMapping({ sceneName: 'Discussion', sceneMap, presets });
  expect(result.preset?.id).toBe('discussion-calme');
  expect(result.reason).toBeNull();
});

test('2. une scène absente de la table ne change rien', () => {
  const result = resolveSceneMapping({ sceneName: 'Starting', sceneMap, presets });
  expect(result.preset).toBeNull();
  expect(result.reason).toBe('unmapped');
});

test('3. une table vide ne change jamais rien', () => {
  const result = resolveSceneMapping({ sceneName: 'Discussion', sceneMap: {}, presets });
  expect(result.preset).toBeNull();
  expect(result.reason).toBe('unmapped');
});

test('4. un preset supprimé entre-temps est signalé, pas appliqué', () => {
  const result = resolveSceneMapping({
    sceneName: 'Discussion',
    sceneMap: { Discussion: 'preset-efface' },
    presets,
  });
  expect(result.preset).toBeNull();
  expect(result.reason).toBe('missing-preset');
});

test('5. un nom de scène vide ou absent ne résout rien', () => {
  expect(resolveSceneMapping({ sceneName: '', sceneMap, presets }).reason).toBe('unmapped');
  expect(resolveSceneMapping({ sceneName: undefined, sceneMap, presets }).reason).toBe('unmapped');
});

test('6. la casse et les espaces du nom de scène ne sont pas normalisés', () => {
  // OBS distingue « Discussion » de « discussion » : normaliser masquerait une erreur de saisie.
  expect(resolveSceneMapping({ sceneName: 'discussion', sceneMap, presets }).reason).toBe('unmapped');
  expect(resolveSceneMapping({ sceneName: ' Discussion', sceneMap, presets }).reason).toBe('unmapped');
});

test('7. une table valide est acceptée', () => {
  expect(validateSceneMap(sceneMap)).toEqual({ ok: true, errors: [] });
});

test('8. une table vide est valide', () => {
  expect(validateSceneMap({})).toEqual({ ok: true, errors: [] });
});

test('9. tout ce qui n’est pas un objet simple est refusé', () => {
  for (const value of [null, undefined, [], 'x', 42]) {
    expect(validateSceneMap(value).ok).toBe(false);
  }
});

test('10. une clé vide est refusée', () => {
  const result = validateSceneMap({ '': 'discussion-calme' });
  expect(result.ok).toBe(false);
  expect(result.errors.join(' ')).toContain('nom de scène');
});

test('11. une valeur non-chaîne ou vide est refusée', () => {
  expect(validateSceneMap({ Discussion: 42 }).ok).toBe(false);
  expect(validateSceneMap({ Discussion: '' }).ok).toBe(false);
});

test('12. toutes les entrées invalides sont listées, pas seulement la première', () => {
  const result = validateSceneMap({ Discussion: 42, BRB: '', '': 'x' });
  expect(result.ok).toBe(false);
  expect(result.errors.length).toBe(3);
});

test('13. la table fournie n’est jamais mutée', () => {
  const input = { ...sceneMap };
  const snapshot = { ...input };
  resolveSceneMapping({ sceneName: 'Discussion', sceneMap: input, presets });
  validateSceneMap(input);
  expect(input).toEqual(snapshot);
});
