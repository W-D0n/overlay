import { describe, expect, test } from 'bun:test';
import { MAX_LAYERS, createLayer } from '../../src/scene/scene-doc.js';
import { createSceneEditor } from '../editor/scene-editor.js';
import { LOAD_WARNING_LAYERS, aloneScene, dropTarget, layerRows, loadGauge } from './layers-panel-view.js';

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

describe('dropTarget', () => {
  const s = scene([L('a'), L('b'), L('c'), L('d'), L('branding', 'branding')]);

  /** Applies the drop to a real editor and returns the stack order (back to front). */
  const dropped = (moving, over, edge) => {
    const target = dropTarget(s, moving, over, edge);
    if (target === null) return null;
    const editor = createSceneEditor({ scene: s });
    editor.moveLayersTo(moving, target);
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
    expect(dropTarget(s, ['a'], 'a', 'top')).toBeNull();
    expect(dropTarget(s, ['a'], 'branding', 'top')).toBeNull();
    expect(dropTarget(s, ['branding'], 'a', 'bottom')).toBeNull();
    expect(dropTarget(s, ['a', 'branding'], 'b', 'top')).toBeNull();
    expect(dropTarget(s, ['inconnue'], 'b', 'top')).toBeNull();
    expect(dropTarget(s, ['a'], 'inconnue', 'top')).toBeNull();
  });
});

describe('rows of a scene with groups', () => {
  const G = (id, over = {}) => createLayer({ id, kind: 'group', ...over });
  const grouped = () => scene([L('a', 'rain', { group: 'g' }), L('b', 'bubble', { group: 'g' }), G('g'), L('c')]);
  const rows = (over = {}) => layerRows(grouped(), { selection: [], solo: null, labelOf, ...over });

  test('a group is a row in front of its members, one level in', () => {
    expect(rows().map((row) => [row.id, row.depth])).toEqual([['c', 0], ['g', 0], ['b', 1], ['a', 1]]);
    const [, groupRow, member] = rows();
    expect(groupRow).toMatchObject({ group: true, owner: null, members: 2, title: 'group', collapsed: false });
    expect(member).toMatchObject({ group: false, owner: 'g', members: 0 });
  });

  test('the members of a collapsed group have no row; the group says it is collapsed', () => {
    const view = rows({ collapsed: new Set(['g']) });
    expect(view.map((row) => row.id)).toEqual(['c', 'g']);
    expect(view[1].collapsed).toBe(true);
  });

  test('collapsing a group that is not there changes nothing', () => {
    expect(rows({ collapsed: new Set(['ghost']) }).length).toBe(4);
  });

  test('the subtitle of a group counts its layers, with its type when it is renamed and its opacity when it is not full', () => {
    const view = layerRows(scene([L('a', 'rain', { group: 'g' }), G('g', { name: 'Titre', opacity: 0.5 })]), { selection: [], solo: null, labelOf });
    expect(view[0].subtitle).toBe('group · 1 couche · 50 %');
    expect(rows()[1].subtitle).toBe('2 couches');
  });

  test('a member of a hidden or locked group says so, whatever its own flags', () => {
    const layers = scene([L('a', 'rain', { group: 'g' }), L('b', 'bubble', { group: 'g', visible: false }), G('g', { visible: false, locked: true })]);
    const view = layerRows(layers, { selection: [], solo: null, labelOf });
    const byId = Object.fromEntries(view.map((row) => [row.id, row]));
    expect(byId.a).toMatchObject({ visible: true, hiddenByGroup: true, lockedByGroup: true });
    expect(byId.b).toMatchObject({ visible: false, hiddenByGroup: true });
    expect(byId.g).toMatchObject({ visible: false, locked: true, hiddenByGroup: false, lockedByGroup: false });
    expect(rows().every((row) => !row.hiddenByGroup && !row.lockedByGroup)).toBe(true);
  });

  test('the load gauge counts what draws, not the groups', () => {
    expect(loadGauge(grouped())).toMatchObject({ count: 3, label: `3 / ${MAX_LAYERS}` });
  });
});

describe('dropTarget over groups', () => {
  const G = (id) => createLayer({ id, kind: 'group' });
  const grouped = () => scene([L('a', 'rain', { group: 'g' }), L('b', 'bubble', { group: 'g' }), G('g'), L('c'), L('d')]);

  test('the bottom edge of an expanded group row drops into the group, at its front', () => {
    expect(dropTarget(grouped(), ['d'], 'g', 'bottom')).toEqual({ into: 'g' });
  });

  test('the top edge of a group row drops in front of the whole group', () => {
    expect(dropTarget(grouped(), ['d'], 'g', 'top')).toEqual({ beside: 'g', side: 'front' });
  });

  test('for a collapsed group both edges drop beside it', () => {
    expect(dropTarget(grouped(), ['d'], 'g', 'bottom', new Set(['g']))).toEqual({ beside: 'g', side: 'back' });
  });

  test('over a member, the drop joins its group', () => {
    expect(dropTarget(grouped(), ['d'], 'a', 'top')).toEqual({ beside: 'a', side: 'front' });
  });

  test('a group dropped onto the bottom edge of another group goes behind it instead of into it', () => {
    const two = scene([L('a', 'rain', { group: 'g' }), G('g'), L('b', 'rain', { group: 'h' }), G('h')]);
    expect(dropTarget(two, ['h'], 'g', 'bottom')).toEqual({ beside: 'g', side: 'back' });
  });

  test('onto itself, onto one of its own members: nothing', () => {
    expect(dropTarget(grouped(), ['g'], 'g', 'top')).toBeNull();
    expect(dropTarget(grouped(), ['g'], 'a', 'top')).toBeNull();
  });
});

describe('aloneScene', () => {
  const layer = createLayer({ id: 'a', kind: 'rain', name: 'Pluie', opacity: 0.4, visible: false, blur: 6, rotation: 20, placement: { x: 0.2, y: 0.3, width: 0.4, height: 0.2 }, options: { count: 9 } });

  test('la couche seule, pleine toile, visible et opaque, avec ses réglages d’effet', () => {
    const scene = aloneScene({ ...layer, group: 'g' });
    expect(scene).toMatchObject({ version: 1, id: 'vignette', name: 'Pluie' });
    expect(scene.layers).toHaveLength(1);
    expect(scene.layers[0]).toMatchObject({ id: 'a', kind: 'rain', visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: { count: 9 } });
  });

  test('sans le rendu étendu ni le groupe, et nommée d’après son type à défaut de nom', () => {
    const [alone] = aloneScene({ ...layer, group: 'g' }).layers;
    expect(alone.blur).toBeUndefined();
    expect(alone.rotation).toBeUndefined();
    expect(alone.group).toBeUndefined();
    const { name: _name, ...unnamed } = layer;
    expect(aloneScene(unnamed).name).toBe('rain');
  });
});
