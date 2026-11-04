import { describe, expect, test } from 'bun:test';
import { MAX_LAYERS, createLayer } from '../scene-doc.js';
import { MAX_GROUPS } from '../layer-group.js';
import {
  knownIds, planAddLayer, planDuplicateLayers, planGroupLayers, planInsertLayers, planMoveLayers, planRemoveLayers, planSetLayerKind, planUngroupLayers, uniqueLayerId,
} from './scene-edits.js';

const scene = (layers = []) => ({ version: 1, id: 'nuit', name: 'Nuit', layers });
const effect = (id, kind = 'rain', over = {}) => createLayer({ id, kind, ...over });
const branding = () => createLayer({ id: 'branding', kind: 'branding' });
const ids = (plan) => plan.layers.map((layer) => layer.id);
/** A scene of `count` effects `e1…`. */
const many = (count) => scene(Array.from({ length: count }, (_, index) => effect(`e${index + 1}`)));

describe('knownIds et uniqueLayerId', () => {
  test('knownIds garde les couches présentes, sans doublon, dans l’ordre de la scène', () => {
    expect(knownIds(scene([effect('a'), effect('b'), effect('c')]), ['c', 'zz', 'a', 'c'])).toEqual(['a', 'c']);
  });

  test('uniqueLayerId assainit la base et suffixe en cas de collision', () => {
    expect(uniqueLayerId(scene([]), 'Mon effet !')).toBe('Mon-effet');
    expect(uniqueLayerId(scene([effect('a'), effect('a-2')]), 'a')).toBe('a-3');
    expect(uniqueLayerId(scene([]), '!!!')).toBe('couche');
  });
});

describe('planAddLayer', () => {
  test('refuse un type inconnu, un groupe, la limite de couches et un second branding', () => {
    expect(planAddLayer(scene(), [], { kind: 'nope' })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(planAddLayer(scene(), [], { kind: 'group' })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(planAddLayer(many(MAX_LAYERS), [], { kind: 'rain' })).toMatchObject({ ok: false, reason: 'limit' });
    expect(planAddLayer(many(MAX_LAYERS - 1), [], { kind: 'rain' }).ok).toBe(true);
    expect(planAddLayer(scene([branding()]), [], { kind: 'branding' })).toMatchObject({ ok: false, reason: 'unique' });
  });

  test('un effet se place au-dessus de la sélection (la plus haute), sinon en haut des effets, sous le branding', () => {
    const base = scene([effect('a'), effect('b'), effect('c'), branding()]);
    expect(ids(planAddLayer(base, [], { kind: 'rain' }))).toEqual(['a', 'b', 'c', 'rain', 'branding']);
    expect(ids(planAddLayer(base, ['a'], { kind: 'rain' }))).toEqual(['a', 'rain', 'b', 'c', 'branding']);
    expect(ids(planAddLayer(base, ['a', 'b'], { kind: 'rain' }))).toEqual(['a', 'b', 'rain', 'c', 'branding']);
    expect(ids(planAddLayer(base, ['branding'], { kind: 'rain' }))).toEqual(['a', 'b', 'c', 'rain', 'branding']);
  });

  test('au-dessus d’une couche de groupe, la nouvelle couche rejoint le groupe', () => {
    const grouped = planGroupLayers(scene([effect('a'), effect('b')]), ['a']);
    const plan = planAddLayer({ ...scene(), layers: grouped.layers }, ['a'], { kind: 'bubble' });
    expect(plan.layers.find((layer) => layer.id === 'bubble').group).toBe('group');
  });

  test('le branding se place tout en haut, la sélection ne le déplace pas, et il est la seule couche sélectionnée ensuite', () => {
    const plan = planAddLayer(scene([effect('a'), effect('b')]), ['a'], { kind: 'branding' });
    expect(ids(plan)).toEqual(['a', 'b', 'branding']);
    expect(plan.selection).toEqual(['branding']);
    expect(plan.result).toEqual({ id: 'branding' });
    expect(plan.label).toBe('Ajouter une couche');
  });

  test('l’opération enregistrée garde le type résolu et les seuls paramètres donnés', () => {
    const plan = planAddLayer(scene(), [], { kind: 'rain', name: 'Pluie', opacity: 0.5 });
    expect(plan.operation).toEqual({ op: 'addLayer', ids: ['rain'], args: { kind: 'rain', name: 'Pluie', opacity: 0.5 } });
  });
});

describe('planRemoveLayers', () => {
  test('refuse ce qui n’existe pas et libellé selon le nombre', () => {
    expect(planRemoveLayers(many(2), [], ['zz'])).toMatchObject({ ok: false, reason: 'unknown' });
    expect(planRemoveLayers(many(3), [], ['e1']).label).toBe('Supprimer une couche');
    expect(planRemoveLayers(many(3), [], ['e1', 'e2']).label).toBe('Supprimer 2 couches');
  });

  test('retire de la sélection ce qui disparaît, garde le reste, et garde l’identifiant des cibles', () => {
    const plan = planRemoveLayers(many(3), ['e1', 'e3'], ['e1']);
    expect(ids(plan)).toEqual(['e2', 'e3']);
    expect(plan.selection).toEqual(['e3']);
    expect(plan.operation).toEqual({ op: 'removeLayers', ids: ['e1'], args: {} });
  });
});

describe('planDuplicateLayers', () => {
  test('refuse l’inconnu, une couche d’identité, et les limites exactes de couches et de groupes', () => {
    expect(planDuplicateLayers(many(2), ['zz'])).toMatchObject({ ok: false, reason: 'unknown' });
    expect(planDuplicateLayers(scene([branding()]), ['branding'])).toMatchObject({ ok: false, reason: 'unique' });
    expect(planDuplicateLayers(many(MAX_LAYERS), ['e1'])).toMatchObject({ ok: false, reason: 'limit' });
    expect(planDuplicateLayers(many(MAX_LAYERS - 1), ['e1']).ok).toBe(true);
  });

  test('une copie vient juste au-dessus de son original, sans verrou, nommée « copie », et seule sélectionnée', () => {
    const plan = planDuplicateLayers(scene([effect('a', 'rain', { name: 'Pluie', locked: true }), effect('b')]), ['a']);
    expect(ids(plan)).toEqual(['a', 'a-2', 'b']);
    const copy = plan.layers[1];
    expect(copy.name).toBe('Pluie copie');
    expect(copy.locked).toBeUndefined();
    expect(plan.selection).toEqual(['a-2']);
    expect(plan.result).toEqual({ ids: ['a-2'] });
    expect(plan.label).toBe('Dupliquer une couche');
    expect(planDuplicateLayers(many(4), ['e1', 'e2']).label).toBe('Dupliquer 2 couches');
  });

  test('un groupe se copie avec ses membres, qui suivent la copie du groupe ; elle compte ses membres dans la limite', () => {
    const grouped = { ...scene(), layers: planGroupLayers(scene([effect('a'), effect('b'), effect('c')]), ['a', 'b']).layers };
    const plan = planDuplicateLayers(grouped, ['group']);
    const groupCopy = plan.selection[0];
    expect(plan.layers.filter((layer) => layer.group === groupCopy)).toHaveLength(2);
    expect(ids(plan).indexOf(groupCopy)).toBe(ids(plan).indexOf('group') + 3);
    // 3 drawn layers + a group of 2 copied: 3 + 2 = 5 fits, and 7 + 2 = 9 does not.
    expect(planDuplicateLayers({ ...scene(), layers: planGroupLayers(many(7), ['e1', 'e2']).layers }, ['group'])).toMatchObject({ ok: false, reason: 'limit' });
  });

  test('la limite de groupes est exacte', () => {
    let current = many(8);
    for (let n = 0; n < MAX_GROUPS; n += 1) current = { ...current, layers: planGroupLayers(current, [`e${n + 1}`]).layers };
    expect(planDuplicateLayers(current, [current.layers.find((layer) => layer.id.startsWith('group')).id])).toMatchObject({ ok: false, reason: 'limit' });
    // One group short of the limit: copying a group is the last one allowed.
    let almost = many(5);
    for (let n = 0; n < MAX_GROUPS - 1; n += 1) almost = { ...almost, layers: planGroupLayers(almost, [`e${n + 1}`]).layers };
    expect(planDuplicateLayers(almost, ['group']).ok).toBe(true);
  });
});

describe('planMoveLayers', () => {
  test('un déplacement sans effet est « inchangé » ; sinon la sélection est conservée', () => {
    const base = scene([effect('a'), effect('b'), effect('c')]);
    expect(planMoveLayers(base, ['c'], ['c'], 'up')).toEqual({ ok: true, unchanged: true });
    const plan = planMoveLayers(base, ['b'], ['b'], 'up');
    expect(ids(plan)).toEqual(['a', 'c', 'b']);
    expect(plan.selection).toEqual(['b']);
    expect(plan.label).toBe('Réordonner');
    expect(plan.operation).toEqual({ op: 'moveLayers', ids: ['b'], args: { where: 'up' } });
    expect(planMoveLayers(base, [], ['zz'], 'up')).toMatchObject({ ok: false, reason: 'unknown' });
  });

  test('« up » monte d’un cran, « top » et « bottom » regroupent le bloc', () => {
    const base = scene([effect('a'), effect('b'), effect('c')]);
    expect(ids(planMoveLayers(base, [], ['a'], 'up'))).toEqual(['b', 'a', 'c']);
    expect(ids(planMoveLayers(base, [], ['a'], 'top'))).toEqual(['b', 'c', 'a']);
    expect(ids(planMoveLayers(base, [], ['c'], 'bottom'))).toEqual(['c', 'a', 'b']);
  });

  test('les effets et le branding ne se mélangent pas ; le branding se déplace parmi les identités, sous les effets', () => {
    const base = scene([effect('a'), effect('b'), branding()]);
    expect(planMoveLayers(base, [], ['a', 'branding'], 'up')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(planMoveLayers(base, [], ['branding'], 'down')).toEqual({ ok: true, unchanged: true });
    expect(ids(planMoveLayers(base, [], ['a'], 'top'))).toEqual(['b', 'a', 'branding']);
    expect(planMoveLayers(base, [], ['branding'], 'top')).toEqual({ ok: true, unchanged: true });
  });

  test('une sélection répartie entre un groupe et le reste est refusée ; dans un groupe, seuls les membres bougent', () => {
    const grouped = { ...scene(), layers: planGroupLayers(scene([effect('a'), effect('b'), effect('c')]), ['a', 'b']).layers };
    expect(planMoveLayers(grouped, [], ['a', 'c'], 'up')).toMatchObject({ ok: false, reason: 'invalid' });
    const inside = planMoveLayers(grouped, [], ['a'], 'up');
    expect(ids(inside)).toEqual(['b', 'a', 'group', 'c']);
  });
});

describe('planInsertLayers', () => {
  test('refuse un collage vide, au-delà de la limite (exacte) de couches ou de groupes, et un second branding', () => {
    expect(planInsertLayers(many(2), [], [])).toMatchObject({ ok: false, reason: 'empty' });
    expect(planInsertLayers(many(MAX_LAYERS - 1), [], [effect('x')]).ok).toBe(true);
    expect(planInsertLayers(many(MAX_LAYERS), [], [effect('x')])).toMatchObject({ ok: false, reason: 'limit' });
    expect(planInsertLayers(scene([branding()]), [], [branding()])).toMatchObject({ ok: false, reason: 'unique' });
    const groups = (count) => {
      let current = many(5);
      for (let n = 0; n < count; n += 1) current = { ...current, layers: planGroupLayers(current, [`e${n + 1}`]).layers };
      return current;
    };
    const oneGroup = planGroupLayers(many(2), ['e1']).layers.filter((layer) => layer.id === 'group' || layer.group === 'group').map((layer) => (layer.id === 'group' ? layer : { ...layer }));
    expect(planInsertLayers(groups(MAX_GROUPS), [], oneGroup)).toMatchObject({ ok: false, reason: 'limit' });
    expect(planInsertLayers({ ...scene(), layers: [] }, [], oneGroup).ok).toBe(true);
    expect(planInsertLayers(groups(MAX_GROUPS - 1), [], [effect('z')]).ok).toBe(true);
    expect(planInsertLayers(groups(MAX_GROUPS - 1), [], oneGroup).ok).toBe(true);
  });

  test('les couches collées prennent des identifiants neufs, sont libres de verrou et sélectionnées ; le libellé suit le nombre ou celui qu’on donne', () => {
    const base = scene([effect('a', 'rain', { locked: true }), effect('b')]);
    const plan = planInsertLayers(base, ['a'], [effect('a', 'rain', { locked: true })]);
    expect(ids(plan)).toEqual(['a', 'a-2', 'b']);
    expect(plan.layers[1].locked).toBeUndefined();
    expect(plan.selection).toEqual(['a-2']);
    expect(plan.label).toBe('Coller une couche');
    expect(planInsertLayers(base, [], [effect('x'), effect('y')]).label).toBe('Coller 2 couches');
    expect(planInsertLayers(base, [], [effect('x')], 'Mon collage').label).toBe('Mon collage');
  });

  test('le branding collé va tout en haut ; les effets collés sous lui', () => {
    const plan = planInsertLayers(scene([effect('a')]), [], [branding(), effect('x')]);
    expect(ids(plan)).toEqual(['a', 'x', 'branding']);
  });

  test('collé au-dessus d’une couche de groupe, un effet libre rejoint le groupe ; un groupe collé garde ses membres et se place au-dessus du bloc', () => {
    const grouped = { ...scene(), layers: planGroupLayers(scene([effect('a'), effect('b')]), ['a']).layers };
    const joined = planInsertLayers(grouped, ['a'], [effect('x')]);
    expect(joined.layers.find((layer) => layer.id === 'x').group).toBe('group');
    const pastedGroup = planGroupLayers(scene([effect('m'), effect('n')]), ['m']).layers;
    const plan = planInsertLayers(grouped, ['a'], pastedGroup);
    const copy = plan.layers.find((layer) => layer.id === 'm');
    expect(copy.group).not.toBeUndefined();
    expect(copy.group).not.toBe('group');
    expect(ids(plan).indexOf(copy.group)).toBeGreaterThan(ids(plan).indexOf('group'));
  });
});

describe('planGroupLayers et planUngroupLayers', () => {
  test('grouper refuse l’inconnu, un groupe de plus que la limite et une couche d’identité ; libellé selon le nombre', () => {
    expect(planGroupLayers(many(2), ['zz'])).toMatchObject({ ok: false, reason: 'unknown' });
    expect(planGroupLayers(scene([branding(), effect('a')]), ['branding'])).toMatchObject({ ok: false, reason: 'invalid' });
    expect(planGroupLayers(many(3), ['e1']).label).toBe('Grouper une couche');
    expect(planGroupLayers(many(3), ['e1', 'e2']).label).toBe('Grouper 2 couches');
    const plan = planGroupLayers(many(3), ['e1']);
    expect(plan.selection).toEqual(['group']);
    expect(plan.result).toEqual({ id: 'group' });
    expect(plan.operation).toEqual({ op: 'groupLayers', ids: ['e1'], args: {} });
  });

  test('la limite de groupes est exacte', () => {
    let current = many(8);
    for (let n = 0; n < MAX_GROUPS - 1; n += 1) current = { ...current, layers: planGroupLayers(current, [`e${n + 1}`]).layers };
    expect(planGroupLayers(current, ['e8']).ok).toBe(true);
    current = { ...current, layers: planGroupLayers(current, ['e8']).layers };
    expect(planGroupLayers(current, ['e7'])).toMatchObject({ ok: false, reason: 'limit' });
  });

  test('dégrouper libère les membres (sélectionnés) à partir du groupe ou d’un membre, et refuse sans groupe', () => {
    const grouped = { ...scene(), layers: planGroupLayers(many(3), ['e1', 'e2']).layers };
    const fromGroup = planUngroupLayers(grouped, ['group']);
    expect(fromGroup.selection).toEqual(['e1', 'e2']);
    expect(fromGroup.layers.some((layer) => layer.group !== undefined)).toBe(false);
    expect(fromGroup.label).toBe('Dégrouper');
    expect(fromGroup.operation).toEqual({ op: 'ungroupLayers', ids: ['group'], args: {} });
    expect(planUngroupLayers(grouped, ['e1']).selection).toEqual(['e1', 'e2']);
    expect(planUngroupLayers(grouped, ['e3'])).toMatchObject({ ok: false, reason: 'invalid' });
  });

  test('plusieurs groupes se dégroupent en une seule entrée', () => {
    let current = many(4);
    current = { ...current, layers: planGroupLayers(current, ['e1']).layers };
    current = { ...current, layers: planGroupLayers(current, ['e2']).layers };
    const plan = planUngroupLayers(current, ['group', 'group-2']);
    expect(plan.label).toBe('Dégrouper 2 groupes');
    expect(plan.selection).toEqual(['e1', 'e2']);
  });
});

describe('planSetLayerKind', () => {
  test('refuse une couche ou un type inconnu, un changement de famille, un second branding', () => {
    const base = scene([effect('a'), effect('t', 'text'), branding()]);
    expect(planSetLayerKind(base, [], 'zz', 'bubble', {})).toMatchObject({ ok: false, reason: 'unknown' });
    expect(planSetLayerKind(base, [], 'a', 'nope', {})).toMatchObject({ ok: false, reason: 'invalid' });
    expect(planSetLayerKind(base, [], 'a', 'text', {})).toMatchObject({ ok: false, reason: 'invalid' });
    expect(planSetLayerKind(base, [], 'a', 'branding', {})).toMatchObject({ ok: false, reason: 'invalid' });
  });

  test('le type reste le même : inchangé, même pour le branding (qui n’est pas son propre doublon)', () => {
    expect(planSetLayerKind(scene([effect('a')]), [], 'a', 'rain', {})).toEqual({ ok: true, unchanged: true });
    expect(planSetLayerKind(scene([branding()]), [], 'branding', 'branding', {})).toEqual({ ok: true, unchanged: true });
  });

  test('change le type et les options de départ, garde la sélection, et se laisse enregistrer', () => {
    const plan = planSetLayerKind(scene([effect('a'), effect('b')]), ['b'], 'a', 'bubble', { count: 9 });
    expect(plan.layers[0]).toMatchObject({ id: 'a', kind: 'bubble', options: { count: 9 } });
    expect(plan.selection).toEqual(['b']);
    expect(plan.label).toBe('Changer l’effet');
    expect(plan.operation).toEqual({ op: 'setLayerKind', ids: ['a'], args: { kind: 'bubble', options: { count: 9 } } });
  });

  test('une entrée propre au texte empêche de passer à une forme, mais pas à un autre texte', () => {
    const lettered = effect('t', 'text', { animation: { enter: { preset: 'letters', durationMs: 500 } } });
    expect(planSetLayerKind(scene([lettered]), [], 't', 'shape', {})).toMatchObject({ ok: false, reason: 'invalid' });
    expect(planSetLayerKind(scene([effect('t', 'text')]), [], 't', 'shape', {}).ok).toBe(true);
  });
});
