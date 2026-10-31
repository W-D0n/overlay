import { describe, expect, test } from 'bun:test';
import { createLayer, validateSceneDoc } from '../scene-doc.js';
import { createSceneEditor } from './scene-editor.js';
import { effectLayers, filterScenes, sceneDetails, sceneEffectsLabel } from './scene-labels.js';
import { ADDABLE_KIND_IDS, defaultBackgroundOptions } from './component-field-schemas.js';

const scene = (layers) => ({ version: 1, id: 'nuit', name: 'Nuit', layers });
const labelOf = (kind) => ({ rain: 'Pluie', text: 'Texte', branding: 'Branding' })[kind] ?? kind;

describe('couches de contenu dans l’éditeur', () => {
  test('la galerie propose les effets, puis les contenus, puis le branding', () => {
    const kinds = [...ADDABLE_KIND_IDS];
    expect(kinds.indexOf('text')).toBeGreaterThan(kinds.indexOf('water-ripple'));
    expect(kinds.indexOf('text')).toBeLessThan(kinds.indexOf('branding'));
    expect(kinds.at(-1)).toBe('branding');
  });

  test('on ajoute un texte avec ses options de départ, au-dessus de l’effet, sous le branding ; la scène reste valide', () => {
    const editor = createSceneEditor({ scene: scene([createLayer({ id: 'a', kind: 'rain' }), createLayer({ id: 'branding', kind: 'branding' })]) });
    const result = editor.addLayer({ kind: 'text', options: defaultBackgroundOptions('text') });
    expect(result.ok).toBe(true);
    expect(editor.state().scene.layers.map((layer) => layer.kind)).toEqual(['rain', 'text', 'branding']);
    expect(editor.state().scene.layers[1].options.text).toEqual(['Titre']);
    expect(validateSceneDoc(editor.state().scene).ok).toBe(true);
  });

  test('un texte se règle comme un effet : options, placement, opacité, rendu étendu, annulation', () => {
    const editor = createSceneEditor({ scene: scene([createLayer({ id: 't', kind: 'text', options: defaultBackgroundOptions('text') })]) });
    expect(editor.setOptions('t', { text: ['Bonsoir'], fontSize: 120 }).ok).toBe(true);
    expect(editor.setLayers(['t'], { rotation: 5, opacity: 0.8 }).ok).toBe(true);
    expect(editor.setPlacement(['t'], { x: 0.1, y: 0.1, width: 0.5, height: 0.2 }).ok).toBe(true);
    expect(editor.state().scene.layers[0]).toMatchObject({ options: { text: ['Bonsoir'], fontSize: 120 }, rotation: 5, opacity: 0.8 });
    editor.undo();
    editor.undo();
    editor.undo();
    expect(editor.state().scene.layers[0].options.text).toEqual(['Titre']);
  });

  test('une option de texte du mauvais type est refusée', () => {
    const editor = createSceneEditor({ scene: scene([createLayer({ id: 't', kind: 'text', options: defaultBackgroundOptions('text') })]) });
    expect(editor.setOptions('t', { fontSize: 'grand' }).ok).toBe(false);
  });

  test('un effet ne devient pas un texte, ni un texte un effet ; deux contenus se remplacent', () => {
    const editor = createSceneEditor({ scene: scene([createLayer({ id: 'a', kind: 'rain' }), createLayer({ id: 't', kind: 'text', options: defaultBackgroundOptions('text') })]) });
    expect(editor.setLayerKind('a', 'text', {})).toMatchObject({ ok: false, reason: 'invalid' });
    expect(editor.setLayerKind('t', 'rain', {})).toMatchObject({ ok: false, reason: 'invalid' });
    expect(editor.setLayerKind('a', 'bubble', {}).ok).toBe(true);
  });
});

describe('listes de scènes avec des contenus', () => {
  const layers = [createLayer({ id: 'a', kind: 'rain' }), createLayer({ id: 't', kind: 'text' }), createLayer({ id: 'branding', kind: 'branding' })];
  const mixed = scene(layers);

  test('le libellé nomme les couches de la scène ; une scène de contenu seul n’est pas « Aucun fond »', () => {
    expect(sceneEffectsLabel(mixed, labelOf)).toBe('Pluie + Texte');
    expect(sceneEffectsLabel(scene([createLayer({ id: 't', kind: 'text' })]), labelOf)).toBe('Texte');
  });

  test('les effets et les contenus se comptent à part', () => {
    expect(effectLayers(mixed).map((layer) => layer.kind)).toEqual(['rain']);
    expect(sceneDetails(mixed)).toEqual(['1 contenu']);
    expect(sceneDetails(scene([createLayer({ id: 'a', kind: 'rain' }), createLayer({ id: 'b', kind: 'rain' }), createLayer({ id: 't', kind: 'text' }), createLayer({ id: 'u', kind: 'text' }), createLayer({ id: 'branding', kind: 'branding' })]))).toEqual(['2 effets', '2 contenus']);
  });

  test('la recherche trouve une scène par le libellé de son contenu', () => {
    expect(filterScenes([mixed], 'texte', labelOf)).toEqual([mixed]);
  });
});
