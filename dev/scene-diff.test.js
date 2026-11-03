import { describe, expect, test } from 'bun:test';
import { createLayer } from '../scene-doc.js';
import { diffScenes, summarize } from './scene-diff.js';

const scene = (layers) => ({ version: 1, id: 'current', name: 'En antenne', layers });
const L = (id, kind = 'rain', over = {}) => createLayer({ id, kind, ...over });
const labelOf = (kind) => ({ rain: 'Pluie', bubble: 'Bulles', branding: 'Branding' })[kind] ?? kind;
const diff = (a, b) => diffScenes(scene(a), scene(b), { labelOf, optionLabel: (_kind, key) => `réglage ${key}` });

describe('couches ajoutées, retirées', () => {
  test('ajout et retrait, avec le nom de la couche ou le libellé de son type', () => {
    const changes = diff([L('a'), L('x', 'bubble', { name: 'Mes bulles' })], [L('a'), L('n', 'bubble')]);
    expect(changes).toEqual([
      { layerId: 'n', kind: 'added', title: 'Bulles', details: [] },
      { layerId: 'x', kind: 'removed', title: 'Mes bulles', details: [] },
    ]);
  });

  test('deux scènes identiques : aucun changement', () => {
    expect(diff([L('a'), L('b', 'bubble')], [L('a'), L('b', 'bubble')])).toEqual([]);
    expect(summarize([])).toBe('Aucun changement');
  });
});

describe('couche modifiée', () => {
  test('visibilité, verrou, opacité', () => {
    const [change] = diff([L('a')], [L('a', 'rain', { visible: false, locked: true, opacity: 0.4 })]);
    expect(change).toMatchObject({ layerId: 'a', kind: 'changed', title: 'Pluie' });
    expect(change.details).toEqual(['masquée', 'verrouillée', 'opacité : 100 % → 40 %']);
  });

  test('le masque : ajouté, changé de forme, inversé, retiré', () => {
    const ellipse = { shape: 'ellipse', x: 0.1, y: 0.1, width: 0.5, height: 0.5, feather: 0.2 };
    expect(diff([L('a')], [L('a', 'rain', { mask: ellipse })])[0].details).toEqual(['masque : aucun → ellipse']);
    expect(diff([L('a', 'rain', { mask: ellipse })], [L('a', 'rain', { mask: { shape: 'linear', angle: 90, start: 0.4, end: 0.6, invert: true } })])[0].details).toEqual(['masque : ellipse → dégradé linéaire inversé']);
    expect(diff([L('a', 'rain', { mask: ellipse })], [L('a')])[0].details).toEqual(['masque : ellipse → aucun']);
  });

  test('the details come in a fixed order: identity, look, motion, geometry, then settings', () => {
    const before = L('a', 'rain', { options: { speed: 1 } });
    const after = L('a', 'bubble', {
      name: 'Autre',
      visible: false,
      opacity: 0.5,
      blend: 'screen',
      blur: 2,
      filters: { hue: 30 },
      crop: { left: 0.1 },
      placement: { x: 0.25, y: 0, width: 1, height: 1 },
      options: { speed: 2 },
    });
    const details = diff([before], [after])[0].details;
    const index = (start) => details.findIndex((entry) => entry.startsWith(start));
    const order = ['effet', 'nom', 'masquée', 'opacité', 'fusion', 'flou', 'filtres', 'rognage', 'X', 'réglage speed'].map(index);
    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });

  test('position et taille, en pourcentage de la toile', () => {
    const [change] = diff([L('a')], [L('a', 'rain', { placement: { x: 0.25, y: 0, width: 0.5, height: 1 } })]);
    expect(change.details).toEqual(['X : 0 % → 25 %', 'largeur : 100 % → 50 %']);
  });

  test('réglages d’effet : seules les clés qui diffèrent, avec leur libellé, ajoutées et retirées comprises', () => {
    const [change] = diff([L('a', 'rain', { options: { speed: 1, color: '#fff', angle: 8 } })], [L('a', 'rain', { options: { speed: 2, color: '#fff', extra: true } })]);
    expect(change.details).toEqual(['réglage angle : 8 → —', 'réglage extra : — → oui', 'réglage speed : 1 → 2']);
  });

  test('changement d’effet, de nom, déverrouillage', () => {
    const [change] = diff([L('a', 'rain', { locked: true })], [L('a', 'bubble', { name: 'Fond' })]);
    expect(change.details).toEqual(['effet : Pluie → Bulles', 'nom : Pluie → Fond', 'déverrouillée']);
  });

  test('les options sont comparées sans tenir compte de l’ordre des clés', () => {
    expect(diff([L('a', 'rain', { options: { a: 1, b: { x: 1, y: 2 } } })], [L('a', 'rain', { options: { b: { y: 2, x: 1 }, a: 1 } })])).toEqual([]);
  });
});

describe('ordre', () => {
  test('réordonner des couches communes est un changement d’ordre', () => {
    const changes = diff([L('a'), L('b', 'bubble')], [L('b', 'bubble'), L('a')]);
    expect(changes).toEqual([{ layerId: null, kind: 'order', title: 'Ordre des couches', details: [] }]);
  });

  test('ajouter ou retirer une couche n’est pas, en soi, un changement d’ordre des autres', () => {
    expect(diff([L('a'), L('b', 'bubble')], [L('a'), L('c'), L('b', 'bubble')]).map((c) => c.kind)).toEqual(['added']);
    expect(diff([L('a'), L('b', 'bubble'), L('c')], [L('a'), L('c')]).map((c) => c.kind)).toEqual(['removed']);
  });
});

describe('résumé', () => {
  test('singulier et pluriel', () => {
    expect(summarize([{ layerId: 'a', kind: 'added', title: 'x', details: [] }])).toBe('1 changement');
    expect(summarize([{ layerId: 'a', kind: 'added', title: 'x', details: [] }, { layerId: null, kind: 'order', title: 'y', details: [] }])).toBe('2 changements');
  });
});
