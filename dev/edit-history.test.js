import { describe, expect, test } from 'bun:test';
import { createLayer } from '../scene-doc.js';
import { compareWithCurrent, describeHistory, formatAge } from './edit-history.js';
import { createSceneEditor } from './scene-editor.js';

const scene = (layers) => ({ version: 1, id: 'nuit', name: 'Nuit', layers });
function setup() {
  let time = 10_000;
  const editor = createSceneEditor({ scene: scene([createLayer({ id: 'a', kind: 'rain' })]), now: () => time });
  return { editor, tick: (ms) => { time += ms; } };
}

describe('éditeur : history et goTo', () => {
  test('history liste chaque entrée avec son avant et son après, et la position', () => {
    const { editor, tick } = setup();
    editor.setLayers(['a'], { opacity: 0.5 });
    tick(2000);
    editor.addLayer({ kind: 'bubble' });
    const history = editor.history();
    expect(history.position).toBe(2);
    expect(history.entries.map((e) => e.label)).toEqual(['Opacité de la couche', 'Ajouter une couche']);
    expect(history.entries[0].before.layers[0].opacity).toBe(1);
    expect(history.entries[0].after.layers[0].opacity).toBe(0.5);
    expect(history.entries[1].at - history.entries[0].at).toBe(2000);
    expect(history.entries[1].after).toBe(editor.state().scene);
  });

  test('les entrées défaites restent listées et rétablissables', () => {
    const { editor } = setup();
    editor.setLayers(['a'], { opacity: 0.5 });
    editor.addLayer({ kind: 'bubble' });
    editor.undo();
    const history = editor.history();
    expect(history.position).toBe(1);
    expect(history.entries).toHaveLength(2);
    expect(history.entries[1].after.layers).toHaveLength(2);
  });

  test('goTo revient et avance en une seule notification, sans rien perdre', () => {
    const { editor } = setup();
    editor.setLayers(['a'], { opacity: 0.5 });
    editor.addLayer({ kind: 'bubble' });
    editor.setLayers(['a'], { opacity: 0.2 });
    let notified = 0;
    editor.subscribe(() => { notified += 1; });
    editor.goTo(1);
    expect(notified).toBe(1);
    expect(editor.state().scene.layers).toHaveLength(1);
    expect(editor.state().scene.layers[0].opacity).toBe(0.5);
    expect(editor.history().entries).toHaveLength(3);
    editor.goTo(3);
    expect(editor.state().scene.layers[0].opacity).toBe(0.2);
    editor.goTo(0);
    expect(editor.state().scene.layers[0].opacity).toBe(1);
    expect(editor.state().canRedo).toBe(true);
  });

  test('goTo borne la position, ne fait rien sur place, est refusé pendant un lot, et une modification coupe le futur', () => {
    const { editor } = setup();
    editor.setLayers(['a'], { opacity: 0.5 });
    editor.goTo(99);
    expect(editor.history().position).toBe(1);
    editor.goTo(-4);
    expect(editor.history().position).toBe(0);
    let notified = 0;
    editor.subscribe(() => { notified += 1; });
    editor.goTo(0);
    expect(notified).toBe(0);
    editor.batch('x', () => { expect(editor.goTo(1).ok).toBe(false); });
    editor.setLayers(['a'], { opacity: 0.9 });
    expect(editor.history().entries).toHaveLength(1);
  });
});

describe('describeHistory', () => {
  test('de la plus récente à l’état de départ, avec état, distance, âge et résumé', () => {
    const { editor, tick } = setup();
    editor.setLayers(['a'], { opacity: 0.5 });
    tick(30_000);
    editor.addLayer({ kind: 'bubble' });
    editor.undo();
    const rows = describeHistory(editor.history(), 10_000 + 90_000);
    expect(rows.map((r) => r.position)).toEqual([2, 1, 0]);
    expect(rows.map((r) => r.state)).toEqual(['undone', 'current', 'start']);
    expect(rows.map((r) => r.distance)).toEqual([1, 0, -1]);
    expect(rows[1].age).toBe('il y a 2 min');
    expect(rows[0].summary).toContain('bubble');
    expect(rows[1].details[0]).toContain('100');
    expect(rows[2].label).toBe('État de départ');
  });

  test('l’état de départ est « courant » quand tout est défait', () => {
    const { editor } = setup();
    editor.setLayers(['a'], { opacity: 0.5 });
    editor.goTo(0);
    expect(describeHistory(editor.history(), 0).at(-1).state).toBe('current');
  });

  test('une entrée sans effet visible le dit', () => {
    const { editor } = setup();
    editor.setSceneProps({ name: 'Autre nom' });
    expect(describeHistory(editor.history(), 0)[0].summary).toContain('sans effet visible');
  });
});

describe('compareWithCurrent', () => {
  test('dit ce que ferait un retour à cette ligne', () => {
    const { editor } = setup();
    editor.setLayers(['a'], { opacity: 0.5 });
    editor.addLayer({ kind: 'bubble' });
    const changes = compareWithCurrent(editor.history(), 1, editor.state().scene);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe('removed');
    expect(compareWithCurrent(editor.history(), 2, editor.state().scene)).toEqual([]);
    expect(compareWithCurrent(editor.history(), 0, editor.state().scene).length).toBe(2);
  });
});

describe('formatAge', () => {
  test('paliers', () => {
    expect(formatAge(0, 5000)).toBe('');
    expect(formatAge(1000, 3000)).toBe('à l’instant');
    expect(formatAge(1000, 31_000)).toBe('il y a 30 s');
    expect(formatAge(1000, 301_000)).toBe('il y a 5 min');
    expect(formatAge(1000, 7_201_000)).toBe('il y a 2 h');
  });
});
