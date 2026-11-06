import { describe, expect, test } from 'bun:test';
import { MAX_LAYERS, canonicalSceneDoc, createLayer } from '../../src/scene/scene-doc.js';
import { MAX_GROUPS, groupErrors } from '../../src/layers/layer-group.js';
import { createSceneEditor, viewScene } from './scene-editor.js';

const at = (x, y, width, height) => ({ x, y, width, height });
const text = (id, extra = {}) => createLayer({ id, kind: 'text', options: {}, ...extra });
const rain = (id, extra = {}) => createLayer({ id, kind: 'rain', options: {}, ...extra });
const group = (id, extra = {}) => createLayer({ id, kind: 'group', options: {}, ...extra });
const branding = () => createLayer({ id: 'branding', kind: 'branding', options: {} });

function setup(layers) {
  let time = 1000;
  // A scene reaches the editor in its canonical form (it comes out of an earlier edit, a version or an import): group boxes are derived.
  const editor = createSceneEditor({ scene: canonicalSceneDoc({ version: 1, id: 's', name: 'S', layers }), now: () => time });
  return {
    editor,
    tick: (ms) => { time += ms; },
    ids: () => editor.state().scene.layers.map(({ id }) => id),
    layer: (id) => editor.state().scene.layers.find((candidate) => candidate.id === id),
    valid: () => groupErrors(editor.state().scene.layers),
  };
}

/** a, b in group g; c free; d in group h with e. */
const grouped = () => [text('a', { group: 'g' }), text('b', { group: 'g' }), group('g'), text('c'), text('d', { group: 'h' }), text('e', { group: 'h' }), group('h')];

describe('groupLayers', () => {
  test('the layers gather in a new group above the top-most one, which is selected', () => {
    const { editor, ids, layer, valid } = setup([text('a'), text('b'), text('c')]);
    const result = editor.groupLayers(['a', 'c']);
    expect(result).toEqual({ ok: true, id: 'group' });
    expect(ids()).toEqual(['b', 'a', 'c', 'group']);
    expect(layer('a').group).toBe('group');
    expect(layer('b').group).toBeUndefined();
    expect(editor.state().selection).toEqual(['group']);
    expect(valid()).toEqual([]);
  });

  test('a single layer can be grouped', () => {
    const { editor, layer } = setup([text('a'), text('b')]);
    expect(editor.groupLayers(['b']).ok).toBe(true);
    expect(layer('b').group).toBe('group');
  });

  test('the group id is unique: group, group-2', () => {
    const { editor } = setup([text('a'), text('b')]);
    expect(editor.groupLayers(['a'])).toMatchObject({ id: 'group' });
    expect(editor.groupLayers(['b'])).toMatchObject({ id: 'group-2' });
  });

  test('it is one history entry, with its label, and undo takes it back', () => {
    const { editor, ids } = setup([text('a'), text('b')]);
    editor.groupLayers(['a', 'b']);
    expect(editor.state().undoLabel).toBe('Grouper 2 couches');
    editor.undo();
    expect(ids()).toEqual(['a', 'b']);
    expect(editor.state().canUndo).toBe(false);
  });

  test('the group box covers its members, without moving them', () => {
    const { editor, layer } = setup([text('a', { placement: at(0.1, 0.1, 0.2, 0.2) }), text('b', { placement: at(0.6, 0.5, 0.2, 0.3) })]);
    editor.groupLayers(['a', 'b']);
    expect(layer('group').placement).toEqual(at(0.1, 0.1, 0.7, 0.7));
    expect(layer('a').placement).toEqual(at(0.1, 0.1, 0.2, 0.2));
  });

  test('refused: nothing, an unknown id, a group, the identity layer; the scene is untouched', () => {
    const { editor, ids } = setup([text('a', { group: 'g' }), group('g'), branding()]);
    expect(editor.groupLayers([])).toMatchObject({ ok: false, reason: 'unknown' });
    expect(editor.groupLayers(['ghost'])).toMatchObject({ ok: false, reason: 'unknown' });
    expect(editor.groupLayers(['g'])).toMatchObject({ ok: false, reason: 'invalid', message: 'seules des couches se groupent : ni un groupe, ni une couche d’identité' });
    expect(editor.groupLayers(['branding'])).toMatchObject({ ok: false, reason: 'invalid', message: 'seules des couches se groupent : ni un groupe, ni une couche d’identité' });
    expect(ids()).toEqual(['a', 'g', 'branding']);
    expect(editor.state().canUndo).toBe(false);
  });

  test('refused at the group limit, with the reason', () => {
    const layers = Array.from({ length: MAX_GROUPS }, (_, index) => [text(`m${index}`, { group: `g${index}` }), group(`g${index}`)]).flat();
    const { editor } = setup([...layers, text('free')]);
    expect(editor.groupLayers(['free'])).toMatchObject({ ok: false, reason: 'limit', message: `${MAX_GROUPS} groupes au plus` });
  });

  test('a layer taken from a group leaves it, and an emptied group goes', () => {
    const { editor, ids, layer } = setup([text('a', { group: 'g' }), group('g'), text('c')]);
    editor.groupLayers(['a', 'c']);
    expect(ids()).toEqual(['a', 'c', 'group']);
    expect(layer('g')).toBeUndefined();
  });
});

describe('ungroupLayers', () => {
  test('the members stay where they are, free and selected; the group is gone', () => {
    const { editor, ids, layer, valid } = setup(grouped());
    const result = editor.ungroupLayers(['g']);
    expect(result).toEqual({ ok: true, ids: ['a', 'b'] });
    expect(ids()).toEqual(['a', 'b', 'c', 'd', 'e', 'h']);
    expect(layer('a').group).toBeUndefined();
    expect(editor.state().selection).toEqual(['a', 'b']);
    expect(valid()).toEqual([]);
  });

  test('asking for a member takes its group apart', () => {
    const { editor, layer } = setup(grouped());
    editor.ungroupLayers(['a']);
    expect(layer('g')).toBeUndefined();
    expect(layer('b').group).toBeUndefined();
    expect(layer('d').group).toBe('h');
  });

  test('several groups at once, once each', () => {
    const { editor, ids } = setup(grouped());
    editor.ungroupLayers(['g', 'e', 'd']);
    expect(ids()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(editor.state().undoLabel).toBe('Dégrouper 2 groupes');
  });

  test('one history entry; undo brings the group back with its look', () => {
    const { editor, layer } = setup([text('a', { group: 'g' }), group('g', { opacity: 0.4 })]);
    editor.ungroupLayers(['g']);
    expect(editor.state().undoLabel).toBe('Dégrouper');
    editor.undo();
    expect(layer('g').opacity).toBe(0.4);
    expect(layer('a').group).toBe('g');
  });

  test('nothing to ungroup: refused, nothing recorded', () => {
    const { editor } = setup(grouped());
    expect(editor.ungroupLayers(['c'])).toMatchObject({ ok: false, reason: 'invalid' });
    expect(editor.ungroupLayers([])).toMatchObject({ ok: false, reason: 'invalid' });
    expect(editor.state().canUndo).toBe(false);
  });
});

describe('removeLayers', () => {
  test('removing a group removes its members', () => {
    const { editor, ids } = setup(grouped());
    editor.removeLayers(['g']);
    expect(ids()).toEqual(['c', 'd', 'e', 'h']);
  });

  test('removing a member keeps the group while another remains', () => {
    const { editor, ids, valid } = setup(grouped());
    editor.removeLayers(['a']);
    expect(ids()).toEqual(['b', 'g', 'c', 'd', 'e', 'h']);
    expect(valid()).toEqual([]);
  });

  test('removing the last member removes the group', () => {
    const { editor, ids } = setup(grouped());
    editor.removeLayers(['a', 'b']);
    expect(ids()).toEqual(['c', 'd', 'e', 'h']);
  });

  test('the removed layers leave the selection, members of a removed group included', () => {
    const { editor } = setup(grouped());
    editor.select(['a', 'c']);
    editor.removeLayers(['g']);
    expect(editor.state().selection).toEqual(['c']);
  });

  test('a group that went because its members went is not left selected', () => {
    const { editor } = setup(grouped());
    editor.select(['g', 'c']);
    editor.removeLayers(['a', 'b']);
    expect(editor.state().selection).toEqual(['c']);
  });

  test('undo brings the whole block back', () => {
    const { editor, ids } = setup(grouped());
    editor.removeLayers(['g']);
    editor.undo();
    expect(ids()).toEqual(['a', 'b', 'g', 'c', 'd', 'e', 'h']);
  });
});

describe('duplicateLayers', () => {
  test('the copy of a member stays in its group, right above it', () => {
    const { editor, ids, layer, valid } = setup(grouped());
    const result = editor.duplicateLayers(['a']);
    expect(ids()).toEqual(['a', 'a-2', 'b', 'g', 'c', 'd', 'e', 'h']);
    expect(layer('a-2').group).toBe('g');
    expect(result.ids).toEqual(['a-2']);
    expect(valid()).toEqual([]);
  });

  test('the copy of a group is a new block with new ids, above the original', () => {
    const { editor, ids, layer, valid } = setup(grouped());
    const result = editor.duplicateLayers(['g']);
    expect(ids()).toEqual(['a', 'b', 'g', 'a-2', 'b-2', 'g-2', 'c', 'd', 'e', 'h']);
    expect(layer('a-2').group).toBe('g-2');
    expect(layer('b-2').group).toBe('g-2');
    expect(layer('a').group).toBe('g');
    expect(result.ids).toEqual(['g-2']);
    expect(editor.state().selection).toEqual(['g-2']);
    expect(valid()).toEqual([]);
  });

  test('the copy of a group keeps its look, loses its lock, and takes the "copie" name', () => {
    const { editor, layer } = setup([text('a', { group: 'g' }), group('g', { opacity: 0.4, locked: true, name: 'Titre' })]);
    editor.duplicateLayers(['g']);
    expect(layer('g-2').opacity).toBe(0.4);
    expect(layer('g-2').locked).toBeUndefined();
    expect(layer('g-2').name).toBe('Titre copie');
  });

  test('a group and its member selected together copy the group once', () => {
    const { editor, ids } = setup(grouped());
    editor.duplicateLayers(['g', 'a']);
    expect(ids().filter((id) => id.startsWith('a')).length).toBe(2);
    expect(ids().filter((id) => id.startsWith('g')).length).toBe(2);
  });

  test('the copies count in the load guard, and the groups in their own limit', () => {
    const many = Array.from({ length: MAX_LAYERS }, (_, index) => text(`m${index}`, { group: 'g' }));
    const full = setup([...many, group('g')]);
    expect(full.editor.duplicateLayers(['g'])).toMatchObject({ ok: false, reason: 'limit', message: `${MAX_LAYERS} couches au plus` });
    const groups = Array.from({ length: MAX_GROUPS }, (_, index) => [text(`n${index}`, { group: `h${index}` }), group(`h${index}`)]).flat();
    const manyGroups = setup(groups);
    expect(manyGroups.editor.duplicateLayers(['h0'])).toMatchObject({ ok: false, reason: 'limit', message: `${MAX_GROUPS} groupes au plus` });
  });

  test('a group is copied with all its members counted against the load guard', () => {
    // 2 members and 5 free layers: 7 layers that draw, so a copy of the group (2 more) would make 9.
    const layers = [text('a', { group: 'g' }), text('b', { group: 'g' }), group('g'), ...Array.from({ length: MAX_LAYERS - 3 }, (_, index) => text(`f${index}`))];
    const { editor } = setup(layers);
    expect(editor.duplicateLayers(['g'])).toMatchObject({ ok: false, reason: 'limit', message: `${MAX_LAYERS} couches au plus` });
  });

  test('one history entry; undo removes the whole copy', () => {
    const { editor, ids } = setup(grouped());
    editor.duplicateLayers(['g']);
    editor.undo();
    expect(ids()).toEqual(['a', 'b', 'g', 'c', 'd', 'e', 'h']);
  });

  test('a free layer still copies as before', () => {
    const { editor, ids } = setup([text('a'), text('b')]);
    editor.duplicateLayers(['a']);
    expect(ids()).toEqual(['a', 'a-2', 'b']);
  });
});

describe('moveLayers', () => {
  test('a group moves as a block, with its members', () => {
    const { editor, ids, valid } = setup(grouped());
    editor.moveLayers(['g'], 'up');
    expect(ids()).toEqual(['c', 'a', 'b', 'g', 'd', 'e', 'h']);
    expect(valid()).toEqual([]);
    editor.moveLayers(['g'], 'up');
    expect(ids()).toEqual(['c', 'd', 'e', 'h', 'a', 'b', 'g']);
  });

  test('a group goes to the top or the bottom as a block', () => {
    const { editor, ids } = setup(grouped());
    editor.moveLayers(['g'], 'top');
    expect(ids()).toEqual(['c', 'd', 'e', 'h', 'a', 'b', 'g']);
    editor.moveLayers(['h'], 'bottom');
    expect(ids()).toEqual(['d', 'e', 'h', 'c', 'a', 'b', 'g']);
  });

  test('a free layer moves past a whole group in one step', () => {
    const { editor, ids } = setup(grouped());
    editor.moveLayers(['c'], 'down');
    expect(ids()).toEqual(['c', 'a', 'b', 'g', 'd', 'e', 'h']);
  });

  test('members reorder inside their group, which stays where it is', () => {
    const { editor, ids, valid } = setup(grouped());
    editor.moveLayers(['a'], 'up');
    expect(ids()).toEqual(['b', 'a', 'g', 'c', 'd', 'e', 'h']);
    expect(valid()).toEqual([]);
    editor.moveLayers(['a'], 'bottom');
    expect(ids()).toEqual(['a', 'b', 'g', 'c', 'd', 'e', 'h']);
  });

  test('members reorder inside their group when the block is not at the bottom of the scene', () => {
    const { editor, ids, valid } = setup([text('x'), text('a', { group: 'g' }), text('b', { group: 'g' }), group('g'), text('y')]);
    editor.moveLayers(['a'], 'up');
    expect(ids()).toEqual(['x', 'b', 'a', 'g', 'y']);
    editor.moveLayers(['a'], 'bottom');
    expect(ids()).toEqual(['x', 'a', 'b', 'g', 'y']);
    expect(valid()).toEqual([]);
  });

  test('a member already at the front of its group does not leave it', () => {
    const { editor } = setup(grouped());
    const before = JSON.stringify(editor.state().scene.layers);
    editor.moveLayers(['b'], 'up');
    expect(JSON.stringify(editor.state().scene.layers)).toBe(before);
    expect(editor.state().canUndo).toBe(false);
  });

  test('members of two groups, or a member with a free layer, are refused', () => {
    const { editor } = setup(grouped());
    expect(editor.moveLayers(['a', 'd'], 'up')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(editor.moveLayers(['a', 'c'], 'up')).toMatchObject({ ok: false, reason: 'invalid' });
  });

  test('a group selected with its member moves as the group', () => {
    const { editor, ids } = setup(grouped());
    editor.moveLayers(['g', 'a'], 'up');
    expect(ids()).toEqual(['c', 'a', 'b', 'g', 'd', 'e', 'h']);
  });

  test('the identity layer stays above the groups', () => {
    const { editor, ids } = setup([...grouped(), branding()]);
    editor.moveLayers(['h'], 'up');
    expect(ids()).toEqual(['a', 'b', 'g', 'c', 'd', 'e', 'h', 'branding']);
    editor.moveLayers(['g'], 'top');
    expect(ids().at(-1)).toBe('branding');
  });

  test('a scene without group is reordered exactly as before', () => {
    const { editor, ids } = setup([text('a'), text('b'), text('c'), text('d')]);
    editor.moveLayers(['b'], 'up');
    expect(ids()).toEqual(['a', 'c', 'b', 'd']);
    editor.moveLayers(['a'], { to: 2 });
    expect(ids()).toEqual(['c', 'b', 'a', 'd']);
  });
});

describe('addLayer', () => {
  test('a group cannot be added: it is made by grouping', () => {
    const { editor } = setup([text('a')]);
    expect(editor.addLayer({ kind: 'group' })).toMatchObject({ ok: false, reason: 'invalid', message: 'un groupe se crée en groupant des couches' });
  });

  test('with a member selected, the new layer joins its group', () => {
    const { editor, ids, layer, valid } = setup(grouped());
    editor.select(['a']);
    const { id } = editor.addLayer({ kind: 'rain' });
    expect(ids()).toEqual(['a', id, 'b', 'g', 'c', 'd', 'e', 'h']);
    expect(layer(id).group).toBe('g');
    expect(valid()).toEqual([]);
  });

  test('with a group selected, the new layer goes above the whole group, outside it', () => {
    const { editor, ids, layer } = setup(grouped());
    editor.select(['g']);
    const { id } = editor.addLayer({ kind: 'rain' });
    expect(ids()).toEqual(['a', 'b', 'g', id, 'c', 'd', 'e', 'h']);
    expect(layer(id).group).toBeUndefined();
  });

  test('groups do not count toward the layer limit; the layers that draw do', () => {
    const members = Array.from({ length: MAX_LAYERS - 1 }, (_, index) => text(`m${index}`, { group: 'g' }));
    const { editor } = setup([...members, group('g')]);
    editor.select([]);
    expect(editor.addLayer({ kind: 'rain' }).ok).toBe(true);
    expect(editor.addLayer({ kind: 'bubble' })).toMatchObject({ ok: false, reason: 'limit' });
  });

  test('without selection the layer goes on top of the effects, as before', () => {
    const { editor, ids } = setup(grouped());
    editor.select([]);
    const { id } = editor.addLayer({ kind: 'rain' });
    expect(ids().at(-1)).toBe(id);
  });
});

describe('setPlacement and setPlacements', () => {
  const placed = () => [text('a', { group: 'g', placement: at(0.2, 0.2, 0.2, 0.2) }), text('b', { group: 'g', placement: at(0.6, 0.5, 0.2, 0.3) }), group('g'), text('c', { placement: at(0.1, 0.1, 0.1, 0.1) })];

  test('placing a group moves and scales its members, and the group follows', () => {
    const { editor, layer } = setup(placed());
    editor.setPlacement(['g'], { x: 0.4 });
    expect(layer('g').placement.x).toBeCloseTo(0.4, 6);
    expect(layer('a').placement.x).toBeCloseTo(0.4, 6);
    expect(layer('b').placement.x).toBeCloseTo(0.8, 6);
    expect(layer('b').placement.width).toBeCloseTo(0.2, 6);
    editor.setPlacement(['g'], { width: 0.3 });
    expect(layer('a').placement.width).toBeCloseTo(0.1, 6);
    expect(layer('g').placement.width).toBeCloseTo(0.3, 6);
  });

  test('a member placed alone moves the group box', () => {
    const { editor, layer } = setup(placed());
    editor.setPlacement(['b'], { x: 0.7 });
    expect(layer('g').placement.x + layer('g').placement.width).toBeCloseTo(0.9, 6);
  });

  test('placing a group is one history entry; undo puts the members back', () => {
    const { editor, layer } = setup(placed());
    editor.setPlacement(['g'], { x: 0.5, y: 0.5 });
    expect(editor.state().undoLabel).toBe('Placer');
    editor.undo();
    expect(layer('a').placement).toEqual(at(0.2, 0.2, 0.2, 0.2));
    expect(layer('g').placement).toEqual(at(0.2, 0.2, 0.6, 0.6));
  });

  test('a group and its member placed together: the member follows the group', () => {
    const { editor, layer } = setup(placed());
    editor.setPlacements({ g: { x: 0.4 }, a: { x: 0.9 } });
    expect(layer('a').placement.x).toBeCloseTo(0.4, 6);
  });

  test('several layers and groups in one entry', () => {
    const { editor, layer } = setup(placed());
    editor.setPlacements({ g: { y: 0.3 }, c: { x: 0.5 } });
    expect(layer('a').placement.y).toBeCloseTo(0.3, 6);
    expect(layer('c').placement.x).toBe(0.5);
    expect(editor.state().undoLabel).toBe('Placer');
  });

  test('a box with no area is refused, nothing changes', () => {
    const { editor, layer } = setup(placed());
    expect(editor.setPlacement(['g'], { width: 0 })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(layer('a').placement).toEqual(at(0.2, 0.2, 0.2, 0.2));
  });

  test('the box of a group is read from its members, even when the scene carries a stale placement for it', () => {
    // A scene that did not go through the canonical form: the group entry still has the default full-frame placement.
    const raw = createSceneEditor({ scene: { version: 1, id: 's', name: 'S', layers: [text('a', { group: 'g', placement: at(0.2, 0.2, 0.2, 0.2) }), group('g')] } });
    raw.setPlacement(['g'], { x: 0.4 });
    const moved = raw.state().scene.layers.find(({ id }) => id === 'a').placement;
    expect(moved.x).toBeCloseTo(0.4, 6);
    expect(moved.width).toBeCloseTo(0.2, 6);
  });

  test('a free layer is placed as before', () => {
    const { editor, layer } = setup(placed());
    editor.setPlacement(['c'], { x: 0.5, width: 0.2 });
    expect(layer('c').placement).toEqual(at(0.5, 0.1, 0.2, 0.1));
  });

  test('the operation reports the targets it was given', () => {
    const { editor } = setup(placed());
    const seen = [];
    editor.onOperation((operation) => seen.push([operation.op, operation.ids]));
    editor.setPlacement(['g'], { x: 0.3 });
    expect(seen).toEqual([['setPlacement', ['g']]]);
  });
});

describe('insertLayers (paste)', () => {
  const copied = () => [text('a', { group: 'g' }), text('b', { group: 'g' }), group('g')];

  test('a pasted group comes with its members under new ids, and they follow the new group', () => {
    const { editor, ids, layer, valid } = setup([text('x', { group: 'g' }), group('g'), text('c')]);
    editor.select(['c']);
    const result = editor.insertLayers(copied());
    expect(result.ok).toBe(true);
    expect(valid()).toEqual([]);
    expect(ids().filter((id) => id.startsWith('g'))).toEqual(['g', 'g-2']);
    const pastedGroup = result.ids.find((id) => layer(id).kind === 'group');
    expect(editor.state().scene.layers.filter(({ group: owner }) => owner === pastedGroup).length).toBe(2);
  });

  test('members pasted without their group become free layers', () => {
    const { editor, layer } = setup([text('c')]);
    const { ids } = editor.insertLayers([text('a', { group: 'gone' })]);
    expect(layer(ids[0]).group).toBeUndefined();
  });

  test('free layers pasted over a member join its group', () => {
    const { editor, layer, valid } = setup(grouped());
    editor.select(['a']);
    const { ids } = editor.insertLayers([text('n')]);
    expect(layer(ids[0]).group).toBe('g');
    expect(valid()).toEqual([]);
  });

  test('a pasted group over a member goes above the whole block, not into it', () => {
    const { editor, ids, valid } = setup(grouped());
    editor.select(['a']);
    editor.insertLayers([text('p', { group: 'q' }), group('q')]);
    expect(valid()).toEqual([]);
    expect(ids().slice(0, 3)).toEqual(['a', 'b', 'g']);
    expect(ids()[3]).toBe('p');
  });

  test('the group limit and the load guard apply to what is pasted', () => {
    const groups = Array.from({ length: MAX_GROUPS }, (_, index) => [text(`m${index}`, { group: `g${index}` }), group(`g${index}`)]).flat();
    const { editor } = setup(groups);
    expect(editor.insertLayers([text('p', { group: 'q' }), group('q')])).toMatchObject({ ok: false, reason: 'limit' });
    const many = Array.from({ length: MAX_LAYERS }, (_, index) => text(`n${index}`));
    const full = setup(many);
    expect(full.editor.insertLayers([text('extra')])).toMatchObject({ ok: false, reason: 'limit' });
  });

  test('the pasted layers are unlocked', () => {
    const { editor, layer } = setup([text('c')]);
    const { ids } = editor.insertLayers([text('a', { locked: true })]);
    expect(layer(ids[0]).locked).toBeUndefined();
  });
});

describe('solo view', () => {
  test('soloing a member keeps its group visible, and hides the rest', () => {
    const view = viewScene({ version: 1, id: 's', name: 'S', layers: grouped() }, 'a');
    const visible = Object.fromEntries(view.layers.map((layer) => [layer.id, layer.visible]));
    expect(visible).toEqual({ a: true, b: false, g: true, c: false, d: false, e: false, h: false });
  });

  test('soloing a group keeps its members visible', () => {
    const view = viewScene({ version: 1, id: 's', name: 'S', layers: grouped() }, 'g');
    const visible = Object.fromEntries(view.layers.map((layer) => [layer.id, layer.visible]));
    expect(visible).toEqual({ a: true, b: true, g: true, c: false, d: false, e: false, h: false });
  });

  test('soloing a free layer hides the groups and their members', () => {
    const view = viewScene({ version: 1, id: 's', name: 'S', layers: grouped() }, 'c');
    expect(view.layers.filter((layer) => layer.visible).map(({ id }) => id)).toEqual(['c']);
  });

  test('no solo, or an unknown one, leaves the scene as it is', () => {
    const scene = { version: 1, id: 's', name: 'S', layers: grouped() };
    expect(viewScene(scene, null)).toBe(scene);
    expect(viewScene(scene, 'ghost')).toBe(scene);
  });
});

describe('a group is edited like a layer', () => {
  test('its own look is set through setLayers', () => {
    const { editor, layer } = setup(grouped());
    expect(editor.setLayers(['g'], { opacity: 0.5, blur: 3, filters: { saturation: 0 } }).ok).toBe(true);
    expect(layer('g')).toMatchObject({ opacity: 0.5, blur: 3, filters: { saturation: 0 } });
    expect(layer('a').opacity).toBe(1);
  });

  test('hiding and locking a group is written on the group, not on its members', () => {
    const { editor, layer } = setup(grouped());
    editor.setLayers(['g'], { visible: false });
    editor.setLayers(['g'], { locked: true });
    expect(layer('g')).toMatchObject({ visible: false, locked: true });
    expect(layer('a').visible).toBe(true);
    expect(layer('a').locked).toBeUndefined();
  });

  test('its animation, bindings and timeline are accepted', () => {
    const { editor, layer } = setup(grouped());
    const animation = { enter: { preset: 'fade', durationMs: 600 } };
    expect(editor.setLayers(['g'], { animation }).ok).toBe(true);
    expect(layer('g').animation).toEqual(animation);
    expect(editor.setLayers(['g'], { bindings: [{ source: 'event:raid', target: 'opacity', from: 0, to: 1, durationMs: 800 }] }).ok).toBe(true);
    expect(editor.setLayers(['g'], { timeline: [{ target: 'scale', keys: [{ t: 0, v: 1, ease: 'linear' }] }] }).ok).toBe(true);
  });

  test('a content animation (text, outline) is refused on a group', () => {
    const { editor } = setup(grouped());
    expect(editor.setLayers(['g'], { animation: { enter: { preset: 'type', durationMs: 1000 } } }).ok).toBe(false);
  });

  test('its type does not change, and nothing becomes a group by changing type', () => {
    const { editor } = setup(grouped());
    expect(editor.setLayerKind('g', 'text')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(editor.setLayerKind('c', 'group')).toMatchObject({ ok: false, reason: 'invalid' });
  });

  test('resetting a group clears its look', () => {
    const { editor, layer } = setup([text('a', { group: 'g' }), group('g', { opacity: 0.5, blur: 4 })]);
    editor.resetLayers(['g']);
    expect(layer('g')).toMatchObject({ opacity: 1 });
    expect(layer('g').blur).toBeUndefined();
  });
});
