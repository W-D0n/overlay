import { describe, expect, test } from 'bun:test';
import { MAX_LAYERS, createLayer } from '../scene-doc.js';
import { createSceneEditor } from './scene-editor.js';
import { LOAD_WARNING_LAYERS, dropPosition, layerRows, loadGauge } from './layers-panel-view.js';

const labelOf = (kind) => ({ rain: 'Pluie', bubble: 'Bulles', dotgrid: 'Points', branding: 'Branding' })[kind] ?? kind;
const scene = (layers) => ({ version: 1, id: 's', name: 'S', layers });
const L = (id, kind = 'rain', over = {}) => createLayer({ id, kind, ...over });

describe('layerRows', () => {
  test('du dessus vers le dessous : le branding (au sommet de la pile) en tête', () => {
    const rows = layerRows(scene([L('a'), L('b', 'bubble'), L('branding', 'branding')]), { selection: [], solo: null, labelOf });
    expect(rows.map((row) => row.id)).toEqual(['branding', 'b', 'a']);
    expect(rows[0].identity).toBe(true);
    expect(rows[1].identity).toBe(false);
  });

  test('titre : le nom de la couche, sinon le libellé de son type ; opacité en pourcentage entier', () => {
    const [named, plain] = layerRows(scene([L('a', 'rain', { opacity: 0.456 }), L('b', 'bubble', { name: 'Mes bulles' })]), { selection: [], solo: null, labelOf });
    expect(named).toMatchObject({ title: 'Mes bulles', kindLabel: 'Bulles', opacityPercent: 100, subtitle: 'Bulles' });
    expect(plain).toMatchObject({ title: 'Pluie', opacityPercent: 46, subtitle: '46 %' });
  });

  test('sous-titre : vide quand rien n’est à ajouter au titre ; type et opacité réunis sinon', () => {
    const rows = layerRows(scene([L('a'), L('b', 'bubble', { name: 'X', opacity: 0.5 })]), { selection: [], solo: null, labelOf });
    expect(rows.map((row) => row.subtitle)).toEqual(['Bulles · 50 %', '']);
  });

  test('sélection, verrou, visibilité et solo se reflètent ; une couche est estompée quand une autre est en solo', () => {
    const rows = layerRows(scene([L('a', 'rain', { locked: true, visible: false }), L('b', 'bubble')]), { selection: ['a'], solo: 'b', labelOf });
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    expect(byId.a).toMatchObject({ selected: true, locked: true, visible: false, solo: false, dimmed: true });
    expect(byId.b).toMatchObject({ selected: false, locked: false, visible: true, solo: true, dimmed: false });
  });

  test('sans solo, rien n’est estompé', () => {
    const rows = layerRows(scene([L('a'), L('b')]), { selection: [], solo: null, labelOf });
    expect(rows.every((row) => !row.dimmed && !row.solo)).toBe(true);
  });
});

describe('loadGauge', () => {
  const stack = (count) => scene(Array.from({ length: count }, (_, i) => L(`l${i}`)));

  test('niveaux : ok, avertissement dès la sixième couche, plein à la borne', () => {
    expect(loadGauge(stack(0)).level).toBe('ok');
    expect(loadGauge(stack(LOAD_WARNING_LAYERS - 1)).level).toBe('ok');
    expect(loadGauge(stack(LOAD_WARNING_LAYERS)).level).toBe('warn');
    expect(loadGauge(stack(MAX_LAYERS - 1)).level).toBe('warn');
    expect(loadGauge(stack(MAX_LAYERS))).toMatchObject({ level: 'full', count: MAX_LAYERS, max: MAX_LAYERS, label: `${MAX_LAYERS} / ${MAX_LAYERS}` });
  });

  test('le conseil change avec le niveau', () => {
    expect(loadGauge(stack(MAX_LAYERS)).hint).toContain('Limite atteinte');
    expect(loadGauge(stack(LOAD_WARNING_LAYERS)).hint).toContain('sous contrôle');
    expect(loadGauge(stack(1)).hint).not.toContain('sous contrôle');
  });
});

describe('dropPosition', () => {
  const s = scene([L('a'), L('b'), L('c'), L('d'), L('branding', 'branding')]);

  /** Applique le dépôt à un vrai éditeur et rend l'ordre de la pile (du dessous au dessus). */
  const dropped = (moving, over, edge) => {
    const target = dropPosition(s, moving, over, edge);
    if (target === null) return null;
    const editor = createSceneEditor({ scene: s });
    editor.moveLayers(moving, target);
    return editor.state().scene.layers.map((layer) => layer.id).join('');
  };

  test('bord haut d’une ligne : juste au-dessus d’elle dans la pile', () => {
    expect(dropped(['a'], 'c', 'top')).toBe('bcadbranding');
    expect(dropped(['a'], 'd', 'top')).toBe('bcdabranding');
  });

  test('bord bas d’une ligne : juste en dessous d’elle dans la pile', () => {
    expect(dropped(['d'], 'b', 'bottom')).toBe('adbcbranding');
    expect(dropped(['d'], 'a', 'bottom')).toBe('dabcbranding');
  });

  test('un bloc de plusieurs couches se dépose d’un seul tenant', () => {
    expect(dropped(['a', 'b'], 'd', 'top')).toBe('cdabbranding');
    expect(dropped(['c', 'd'], 'a', 'bottom')).toBe('cdabbranding');
  });

  test('déposer sur soi-même, ou entre les familles, ne fait rien', () => {
    expect(dropPosition(s, ['a'], 'a', 'top')).toBeNull();
    expect(dropPosition(s, ['a'], 'branding', 'top')).toBeNull();
    expect(dropPosition(s, ['branding'], 'a', 'bottom')).toBeNull();
    expect(dropPosition(s, ['a', 'branding'], 'b', 'top')).toBeNull();
    expect(dropPosition(s, ['inconnue'], 'b', 'top')).toBeNull();
  });
});
