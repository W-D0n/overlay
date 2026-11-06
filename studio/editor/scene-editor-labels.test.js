import { describe, expect, test } from 'bun:test';
import { createSceneEditor } from './scene-editor.js';

const layer = (id) => ({ id, kind: 'text', visible: true, opacity: 1, placement: { x: 0, y: 0, width: 0.5, height: 0.5 }, options: {} });
const editor = (count) => createSceneEditor({ scene: { version: 1, id: 's', name: 's', layers: Array.from({ length: count }, (_, i) => layer(`l${i}`)) } });

/** One patch for each key the editor words in its history, with the label the owner reads in the history and the announcements. */
const PATCHES = [
  ['visible', { visible: false }, (subject) => `Afficher ou masquer ${subject}`],
  ['locked', { locked: true }, (subject) => `Verrouiller ou déverrouiller ${subject}`],
  ['opacity', { opacity: 0.5 }, (subject) => `Opacité de ${subject}`],
  ['blend', { blend: 'screen' }, (subject) => `Fusion de ${subject}`],
  ['rotation', { rotation: 10 }, (subject) => `Rotation de ${subject}`],
  ['crop', { crop: { left: 0.1 } }, (subject) => `Rognage de ${subject}`],
  ['blur', { blur: 3 }, (subject) => `Flou de ${subject}`],
  ['bindings', { bindings: [{ source: 'audio', target: 'scale', from: 1, to: 1.2, durationMs: 100 }] }, (subject) => `Liaisons de ${subject}`],
  ['timeline', { timeline: [{ target: 'opacity', keys: [{ t: 0, v: 0, ease: 'linear' }, { t: 500, v: 1, ease: 'linear' }] }] }, (subject) => `Animation de ${subject}`],
  ['animation', { animation: { enter: { preset: 'fade', durationMs: 500 } } }, (subject) => `Entrée, boucle et sortie de ${subject}`],
  ['filters', { filters: { hue: 30 } }, (subject) => `Filtres de ${subject}`],
  ['mask', { mask: { shape: 'ellipse', x: 0.1, y: 0.1, width: 0.5, height: 0.5, feather: 0.2 } }, (subject) => `Masque de ${subject}`],
];

describe('history labels of a layer patch', () => {
  for (const [key, patch, label] of PATCHES) {
    test(`${key}: worded for one layer and for several`, () => {
      const one = editor(1);
      expect(one.setLayers(['l0'], patch).ok).toBe(true);
      expect(one.state().undoLabel).toBe(label('la couche'));
      const many = editor(3);
      expect(many.setLayers(['l0', 'l1', 'l2'], patch).ok).toBe(true);
      expect(many.state().undoLabel).toBe(label('3 couches'));
    });
  }

  test('renaming is worded for one layer whatever the count', () => {
    const e = editor(1);
    e.setLayers(['l0'], { name: 'Titre' });
    expect(e.state().undoLabel).toBe('Renommer une couche');
  });

  test('several keys at once are a plain adjustment', () => {
    const e = editor(1);
    e.setLayers(['l0'], { opacity: 0.5, blur: 2 });
    expect(e.state().undoLabel).toBe('Régler la couche');
    const many = editor(2);
    many.setLayers(['l0', 'l1'], { opacity: 0.5, blur: 2 });
    expect(many.state().undoLabel).toBe('Régler 2 couches');
  });
});
