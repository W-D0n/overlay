import { describe, expect, test } from 'bun:test';
import { createLayer } from '../scene-doc.js';
import { announcement, createAnnouncer } from './announcer.js';
import { createSceneEditor } from './scene-editor.js';

const make = () => createSceneEditor({ scene: { version: 1, id: 'n', name: 'N', layers: [createLayer({ id: 'a', kind: 'rain' }), createLayer({ id: 'b', kind: 'bubble', name: 'Mes bulles' })] } });
const snap = (editor) => ({ state: editor.state(), history: editor.history() });
const labelOf = (kind) => `Effet ${kind}`;
/** Ce que dit l'annonce après `act`. */
function said(editor, act) {
  const before = snap(editor);
  act();
  return announcement(before, snap(editor), labelOf);
}

describe('announcement', () => {
  test('sélection : une couche (par son nom ou son type), plusieurs, aucune', () => {
    const editor = make();
    expect(said(editor, () => editor.select(['a']))).toBe('Couche sélectionnée : Effet rain');
    expect(said(editor, () => editor.select(['b']))).toBe('Couche sélectionnée : Mes bulles');
    expect(said(editor, () => editor.selectAll())).toBe('2 couches sélectionnées');
    expect(said(editor, () => editor.clearSelection())).toBe('Aucune couche sélectionnée');
  });

  test('une sélection inchangée ne dit rien', () => {
    const editor = make();
    editor.select(['a']);
    expect(said(editor, () => editor.select(['a']))).toBeNull();
  });

  test('une modification de l’utilisateur ne dit rien (il vient de la faire)', () => {
    const editor = make();
    editor.select(['a']);
    expect(said(editor, () => editor.setLayers(['a'], { opacity: 0.5 }))).toBeNull();
  });

  test('annuler et rétablir disent quelle étape', () => {
    const editor = make();
    editor.setLayers(['a'], { opacity: 0.5 });
    expect(said(editor, () => editor.undo())).toBe('Annulé : Opacité de la couche');
    expect(said(editor, () => editor.redo())).toBe('Rétabli : Opacité de la couche');
  });

  test('un retour de plusieurs étapes dit combien', () => {
    const editor = make();
    editor.setLayers(['a'], { opacity: 0.5 });
    editor.setLayers(['b'], { opacity: 0.4 });
    editor.addLayer({ kind: 'rain' });
    expect(said(editor, () => editor.goTo(0))).toBe('Retour de 3 étapes');
    expect(said(editor, () => editor.goTo(2))).toBe('Avance de 2 étapes');
  });

  test('une modification après un annuler n’est pas prise pour un rétablissement', () => {
    const editor = make();
    editor.setLayers(['a'], { opacity: 0.5 });
    editor.undo();
    expect(said(editor, () => editor.setLayers(['a'], { opacity: 0.9 }))).toBeNull();
  });
});

describe('createAnnouncer', () => {
  test('écrit dans la zone, relit une phrase répétée, cesse une fois détruit', () => {
    const editor = make();
    const element = { textContent: '' };
    const announcer = createAnnouncer({ element, editor, labelOf });
    editor.setLayers(['a'], { opacity: 0.5 });
    editor.setLayers(['b'], { opacity: 0.4 });
    editor.undo();
    const first = element.textContent;
    expect(first).toBe('Annulé : Opacité de la couche');
    editor.undo();
    expect(element.textContent).not.toBe(first);
    expect(element.textContent.trim()).toBe(first);
    announcer.destroy();
    editor.select(['b']);
    expect(element.textContent.trim()).toBe(first);
  });
});
