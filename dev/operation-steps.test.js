import { describe, expect, test } from 'bun:test';
import { createLayer } from '../scene-doc.js';
import { createCommandRegistry } from './command-registry.js';
import { createMacroRecorder, toCommand, validateCustomCommand } from './custom-commands.js';
import { applyStep, describeStep, mergeSteps, operationToStep, stepErrors, stepFields, withStepValue } from './operation-steps.js';
import { createSceneEditor } from './scene-editor.js';

const scene = (layers) => ({ version: 1, id: 'nuit', name: 'Nuit', layers });
const effect = (id, kind = 'rain', over = {}) => createLayer({ id, kind, ...over });
const make = () => createSceneEditor({ scene: scene([effect('a'), effect('b', 'bubble'), effect('c')]) });
const kindOf = (editor) => (id) => editor.state().scene.layers.find((l) => l.id === id)?.kind;
const layer = (editor, id) => editor.state().scene.layers.find((l) => l.id === id);

/** Les opérations vues par l'éditeur pendant `run`. */
function capture(editor, run) {
  const seen = [];
  const off = editor.onOperation((op) => seen.push(op));
  run();
  off();
  return seen;
}

describe('éditeur : onOperation', () => {
  test('annonce chaque opération réussie avec ses arguments, jamais un refus ni un annuler', () => {
    const editor = make();
    const seen = capture(editor, () => {
      editor.setLayers(['a'], { opacity: 0.5 });
      editor.setLayers(['inconnue'], { opacity: 0.5 });
      editor.setLayers(['a'], { couleur: 1 });
      editor.undo();
    });
    expect(seen).toEqual([{ op: 'setLayers', ids: ['a'], args: { patch: { opacity: 0.5 } } }]);
  });

  test('setPlacements joint le placement d’avant, calculé avant l’édition', () => {
    const editor = make();
    editor.setPlacement(['a'], { x: 0.1 });
    const [op] = capture(editor, () => editor.setPlacements({ a: { x: 0.3 } }));
    expect(op.before.a.x).toBe(0.1);
  });

  test('se désabonner l’arrête', () => {
    const editor = make();
    const seen = [];
    editor.onOperation((op) => seen.push(op))();
    editor.setLayers(['a'], { opacity: 0.2 });
    expect(seen).toEqual([]);
  });
});

describe('capter : operationToStep', () => {
  const editor = make();
  const to = (op) => operationToStep(op, { kindOf: kindOf(editor) });

  test('réglage de couche, placement, réglage d’effet (avec son type), ajout, suppression', () => {
    expect(to({ op: 'setLayers', ids: ['a'], args: { patch: { opacity: 0.4 } } })).toEqual({ step: { op: 'layer', args: { patch: { opacity: 0.4 } }, target: 'selection' } });
    expect(to({ op: 'setPlacement', ids: ['a'], args: { patch: { x: 0.2 } } }).step.op).toBe('placement');
    expect(to({ op: 'setOptions', ids: ['b'], args: { patch: { count: 3 } } })).toEqual({ step: { op: 'options', args: { patch: { count: 3 } }, target: 'selection', kind: 'bubble' } });
    expect(to({ op: 'addLayer', ids: ['z'], args: { kind: 'rain' } })).toEqual({ step: { op: 'addLayer', args: { kind: 'rain' } } });
    expect(to({ op: 'removeLayers', ids: ['a'], args: {} }).step.op).toBe('removeLayers');
  });

  test('un placement identique pour toutes les couches est un placement ; un même déplacement est un déplacement', () => {
    expect(to({ op: 'setPlacements', ids: ['a', 'b'], args: { patches: { a: { x: 0.5 }, b: { x: 0.5 } } } }).step).toMatchObject({ op: 'placement', args: { patch: { x: 0.5 } } });
    const moved = to({ op: 'setPlacements', ids: ['a', 'b'], args: { patches: { a: { x: 0.3, y: 0.1 }, b: { x: 0.6, y: 0.4 } } }, before: { a: { x: 0.1, y: 0 }, b: { x: 0.4, y: 0.3 } } });
    expect(moved.step.op).toBe('translate');
    expect(moved.step.args.dx).toBeCloseTo(0.2);
    expect(moved.step.args.dy).toBeCloseTo(0.1);
  });

  test('un placement différent par couche, ou un déplacement à une position précise, n’est pas enregistré et dit pourquoi', () => {
    expect(to({ op: 'setPlacements', ids: ['a', 'b'], args: { patches: { a: { x: 0.3 }, b: { x: 0.9 } } }, before: { a: { x: 0.1 }, b: { x: 0.4 } } }).skipped).toContain('alignement');
    expect(to({ op: 'moveLayers', ids: ['a'], args: { where: { to: 1 } } }).skipped).toContain('position précise');
    expect(to({ op: 'inconnue', ids: [], args: {} }).skipped).toContain('inconnue');
  });

  test('un réglage de la scène retirant une propriété garde null (JSON), pas undefined', () => {
    expect(to({ op: 'setSceneProps', ids: [], args: { patch: { transition: undefined } } }).step.args.patch).toEqual({ transition: null });
  });
});

describe('mergeSteps', () => {
  const layerStep = (patch) => ({ op: 'layer', args: { patch }, target: 'selection' });
  test('réglages successifs d’une même chose : le dernier l’emporte, les autres clés se joignent', () => {
    expect(mergeSteps(layerStep({ opacity: 0.2 }), layerStep({ opacity: 0.8, visible: true }))).toEqual(layerStep({ opacity: 0.8, visible: true }));
  });
  test('les déplacements s’additionnent', () => {
    const t = (dx, dy) => ({ op: 'translate', args: { dx, dy }, target: 'selection' });
    expect(mergeSteps(t(0.1, 0), t(0.2, 0.1)).args).toEqual({ dx: 0.30000000000000004, dy: 0.1 });
  });
  test('opérations ou types d’effet différents, ou structure : jamais fusionnés', () => {
    expect(mergeSteps(layerStep({ opacity: 1 }), { op: 'placement', args: { patch: { x: 0 } }, target: 'selection' })).toBeNull();
    expect(mergeSteps({ op: 'options', args: { patch: { a: 1 } }, target: 'selection', kind: 'rain' }, { op: 'options', args: { patch: { a: 2 } }, target: 'selection', kind: 'bubble' })).toBeNull();
    expect(mergeSteps({ op: 'removeLayers', args: {}, target: 'selection' }, { op: 'removeLayers', args: {}, target: 'selection' })).toBeNull();
  });
});

describe('rejouer : applyStep', () => {
  test('sans sélection, une étape sur la sélection est refusée et le dit', () => {
    const editor = make();
    expect(applyStep({ op: 'layer', args: { patch: { opacity: 0.5 } }, target: 'selection' }, editor)).toEqual({ ok: false, message: 'aucune couche sélectionnée' });
  });

  test('s’applique à la sélection d’aujourd’hui, pas aux couches de l’enregistrement', () => {
    const editor = make();
    editor.select(['c']);
    expect(applyStep({ op: 'layer', args: { patch: { opacity: 0.25 } }, target: 'selection' }, editor).ok).toBe(true);
    expect(layer(editor, 'c').opacity).toBe(0.25);
    expect(layer(editor, 'a').opacity).toBe(1);
  });

  test('placement, déplacement relatif, réglage d’effet limité au même type, structure', () => {
    const editor = make();
    editor.select(['a', 'b']);
    applyStep({ op: 'placement', args: { patch: { x: 0.25, width: 0.5 } }, target: 'selection' }, editor);
    expect(layer(editor, 'a').placement).toMatchObject({ x: 0.25, width: 0.5 });
    applyStep({ op: 'translate', args: { dx: 0.1, dy: 0 }, target: 'selection' }, editor);
    expect(layer(editor, 'b').placement.x).toBeCloseTo(0.35);
    const refused = applyStep({ op: 'options', args: { patch: { count: 9 } }, target: 'selection', kind: 'bubble' }, editor);
    expect(refused.ok).toBe(true);
    expect(layer(editor, 'b').options.count).toBe(9);
    expect(layer(editor, 'a').options.count).not.toBe(9);
    editor.select(['a']);
    expect(applyStep({ op: 'options', args: { patch: { count: 9 } }, target: 'selection', kind: 'bubble' }, editor)).toEqual({ ok: false, message: 'aucune couche « bubble » sélectionnée' });
    applyStep({ op: 'duplicateLayers', args: {}, target: 'selection' }, editor);
    expect(editor.state().scene.layers).toHaveLength(4);
    applyStep({ op: 'addLayer', args: { kind: 'rain' } }, editor);
    expect(editor.state().scene.layers).toHaveLength(5);
  });

  test('une opération inconnue est refusée, pas ignorée', () => {
    expect(applyStep({ op: 'rien', args: {} }, make()).ok).toBe(false);
  });
});

describe('montrer et corriger', () => {
  test('describeStep raconte chaque opération en français', () => {
    expect(describeStep({ op: 'layer', args: { patch: { opacity: 0.6, visible: false } }, target: 'selection' })).toBe('Régler la sélection : opacité 60 %, masquer');
    expect(describeStep({ op: 'placement', args: { patch: { x: 0.1, width: 0.5 } }, target: 'selection' })).toBe('Placer la sélection : x 10 %, largeur 50 %');
    expect(describeStep({ op: 'translate', args: { dx: -0.05, dy: 0.1 }, target: 'selection' })).toContain('−5 %');
    expect(describeStep({ op: 'options', args: { patch: { count: 3 } }, target: 'selection', kind: 'rain' }, (k) => `Pluie ${k}`)).toBe('Régler l’effet « Pluie rain » : count = 3');
    expect(describeStep({ op: 'moveLayers', args: { where: 'top' }, target: 'selection' })).toContain('tout devant');
  });

  test('stepFields expose les valeurs, withStepValue en change une sans toucher l’original', () => {
    const step = { op: 'layer', args: { patch: { opacity: 0.5, visible: true, name: 'x' } }, target: 'selection' };
    expect(stepFields(step)).toEqual([
      { key: 'opacity', label: 'Opacité', type: 'percent', value: 0.5 },
      { key: 'visible', label: 'Visible', type: 'boolean', value: true },
      { key: 'name', label: 'Nom', type: 'text', value: 'x' },
    ]);
    const changed = withStepValue(step, 'opacity', 0.9);
    expect(changed.args.patch.opacity).toBe(0.9);
    expect(step.args.patch.opacity).toBe(0.5);
    expect(stepFields({ op: 'translate', args: { dx: 0.1, dy: 0 } }).map((f) => f.key)).toEqual(['dx', 'dy']);
  });

  test('stepErrors refuse ce qui ne se rejouerait pas ou serait dangereux', () => {
    expect(stepErrors({ op: 'layer', args: { patch: { opacity: 0.5 } } })).toEqual([]);
    expect(stepErrors({ op: 'layer', args: { patch: { opacity: 3 } } })[0]).toContain('opacité');
    expect(stepErrors({ op: 'layer', args: { patch: { id: 'x' } } })[0]).toContain('inconnue');
    expect(stepErrors({ op: 'layer', args: { patch: {} } })).toEqual(['aucun réglage']);
    expect(stepErrors({ op: 'placement', args: { patch: { x: 'a' } } })[0]).toContain('fraction');
    expect(stepErrors({ op: 'options', args: { patch: { a: 1 } } })[0]).toContain('type d’effet');
    expect(stepErrors({ op: 'moveLayers', args: { where: 'ailleurs' } })).toHaveLength(1);
    expect(stepErrors({ op: 'rm -rf', args: {} })[0]).toContain('inconnue');
    expect(stepErrors({ op: 'layer', args: 'non' })[0]).toContain('arguments');
    expect(stepErrors('texte')).toHaveLength(1);
  });
});

describe('commande personnalisée avec gestes', () => {
  test('validateCustomCommand accepte une étape geste valide et refuse une invalide', () => {
    const known = new Set(['edit.copy']);
    const good = validateCustomCommand({ name: 'Mix', steps: ['edit.copy', { op: 'layer', args: { patch: { opacity: 0.5 } }, target: 'selection' }] }, { knownIds: known });
    expect(good.ok).toBe(true);
    const bad = validateCustomCommand({ name: 'Mix', steps: [{ op: 'layer', args: { patch: { opacity: 7 } } }] }, { knownIds: known });
    expect(bad.ok).toBe(false);
  });

  test('s’exécute en un seul geste annulable, et signale une étape geste refusée', () => {
    const editor = make();
    const registry = createCommandRegistry();
    const reports = [];
    const command = toCommand(
      { id: 'custom.m', name: 'Mix', steps: [{ op: 'layer', args: { patch: { opacity: 0.3 } }, target: 'selection' }, { op: 'placement', args: { patch: { x: 0.5 } }, target: 'selection' }] },
      { registry, batch: (label, run) => editor.batch(label, run), labelOf: (id) => id, report: { ok: (m) => reports.push(m), error: (m) => reports.push(`ERR ${m}`) }, editor },
    );
    editor.select(['a']);
    command.run();
    expect(layer(editor, 'a')).toMatchObject({ opacity: 0.3, placement: { x: 0.5 } });
    editor.undo();
    expect(layer(editor, 'a').opacity).toBe(1);
    editor.clearSelection();
    command.run();
    expect(reports.at(-1)).toContain('aucune étape possible');
    expect(reports.at(-1)).toContain('aucune couche sélectionnée');
  });
});

describe('enregistreur de gestes', () => {
  function setup() {
    const editor = make();
    const registry = createCommandRegistry();
    registry.register({ id: 'layer.top', label: 'Devant', group: 'G', run: () => { editor.moveLayers(['a'], 'top'); } });
    const recorder = createMacroRecorder(registry, { subscribe: (l) => editor.onOperation(l), kindOf: kindOf(editor) });
    return { editor, registry, recorder };
  }

  test('capte les gestes, rassemble les réglages successifs, garde l’ordre avec les commandes', () => {
    const { editor, registry, recorder } = setup();
    recorder.start();
    editor.setLayers(['a'], { opacity: 0.9 });
    editor.setLayers(['a'], { opacity: 0.4 });
    registry.run('layer.top');
    editor.setPlacement(['a'], { x: 0.2 });
    expect(recorder.finish()).toEqual([
      { op: 'layer', args: { patch: { opacity: 0.4 } }, target: 'selection' },
      'layer.top',
      { op: 'placement', args: { patch: { x: 0.2 } }, target: 'selection' },
    ]);
  });

  test('ce que fait une commande n’est pas enregistré une seconde fois comme geste', () => {
    const { registry, recorder } = setup();
    recorder.start();
    registry.run('layer.top');
    expect(recorder.finish()).toEqual(['layer.top']);
  });

  test('un geste qui ne se rejoue pas est signalé, pas enregistré', () => {
    const { editor, recorder } = setup();
    recorder.start();
    editor.setPlacements({ a: { x: 0.3 }, b: { x: 0.9 } });
    expect(recorder.steps()).toEqual([]);
    expect(recorder.skipped()[0]).toContain('alignement');
  });

  test('rien n’est capté avant start ni après finish', () => {
    const { editor, recorder } = setup();
    editor.setLayers(['a'], { opacity: 0.1 });
    recorder.start();
    recorder.finish();
    editor.setLayers(['a'], { opacity: 0.2 });
    expect(recorder.steps()).toEqual([]);
  });
});
