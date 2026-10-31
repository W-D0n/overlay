import { describe, expect, test } from 'bun:test';
import { createLayer } from '../scene-doc.js';
import { createSceneEditor } from './scene-editor.js';
import { diffScenes } from './scene-diff.js';
import { applyStep, describeStep, mergeSteps, operationToStep, stepErrors, stepFields, withStepValue } from './operation-steps.js';
import { createLayerClipboard, styleOf } from './layer-clipboard.js';

const scene = (layers) => ({ version: 1, id: 'nuit', name: 'Nuit', layers });
const effect = (id, kind = 'rain', over = {}) => createLayer({ id, kind, ...over });
const make = () => createSceneEditor({ scene: scene([effect('a'), effect('b', 'bubble')]) });
const layer = (editor, id) => editor.state().scene.layers.find((l) => l.id === id);

describe('éditeur : rendu étendu', () => {
  test('setLayers règle la fusion, la rotation, le flou et le rognage ; chaque réglage s’annule', () => {
    const editor = make();
    expect(editor.setLayers(['a'], { blend: 'multiply' }).ok).toBe(true);
    expect(editor.setLayers(['a'], { rotation: 15 }).ok).toBe(true);
    expect(editor.setLayers(['a'], { blur: 3 }).ok).toBe(true);
    expect(editor.setLayers(['a'], { crop: { top: 0.1 } }).ok).toBe(true);
    expect(layer(editor, 'a')).toMatchObject({ blend: 'multiply', rotation: 15, blur: 3, crop: { top: 0.1, right: 0, bottom: 0, left: 0 } });
    expect(editor.state().undoLabel).toBe('Rognage de la couche');
    editor.undo();
    expect('crop' in layer(editor, 'a')).toBe(false);
    editor.undo();
    editor.undo();
    editor.undo();
    expect(layer(editor, 'a')).toEqual(effect('a'));
  });

  test('le rognage se règle côté par côté : un côté ne remet pas les autres à zéro', () => {
    const editor = make();
    editor.setLayers(['a'], { crop: { top: 0.1 } });
    editor.setLayers(['a'], { crop: { left: 0.2 } });
    expect(layer(editor, 'a').crop).toEqual({ top: 0.1, right: 0, bottom: 0, left: 0.2 });
  });

  test('revenir à une valeur neutre retire le champ ; une valeur hors bornes est ramenée dedans ; une valeur invalide est refusée', () => {
    const editor = make();
    editor.setLayers(['a'], { blend: 'screen', rotation: 999 });
    expect(layer(editor, 'a').rotation).toBe(180);
    editor.setLayers(['a'], { blend: 'normal', rotation: 0 });
    expect('blend' in layer(editor, 'a') || 'rotation' in layer(editor, 'a')).toBe(false);
    expect(editor.setLayers(['a'], { blend: 'color-burn' })).toMatchObject({ ok: false, reason: 'invalid' });
  });

  test('un réglage identique ne crée pas d’entrée d’historique', () => {
    const editor = make();
    editor.setLayers(['a'], { blur: 2 });
    const before = editor.history().length;
    editor.setLayers(['a'], { blur: 2 });
    expect(editor.history().length).toBe(before);
  });

  test('resetLayers retire aussi le rendu étendu', () => {
    const editor = make();
    editor.setLayers(['a', 'b'], { blend: 'overlay', rotation: 5, blur: 1, crop: { left: 0.1 }, opacity: 0.5 });
    editor.resetLayers(['a']);
    expect(layer(editor, 'a')).toEqual(effect('a'));
    expect(layer(editor, 'b')).toMatchObject({ blend: 'overlay', rotation: 5 });
  });

  test('applyStyle copie le rendu étendu et efface celui des couches cibles quand le style n’en a pas', () => {
    const editor = make();
    editor.setLayers(['a'], { blend: 'screen', blur: 4 });
    editor.setLayers(['b'], { rotation: 30 });
    editor.applyStyle(['b'], styleOf(layer(editor, 'a')));
    expect(layer(editor, 'b')).toMatchObject({ blend: 'screen', blur: 4 });
    expect('rotation' in layer(editor, 'b')).toBe(false);
    editor.applyStyle(['b'], styleOf(effect('plain')));
    expect(['blend', 'blur', 'rotation'].some((key) => key in layer(editor, 'b'))).toBe(false);
  });

  test('le presse-papiers garde le rendu étendu du style copié', () => {
    const clipboard = createLayerClipboard();
    clipboard.copyStyle(effect('z', 'rain', { blend: 'multiply', crop: { top: 0.2, right: 0, bottom: 0, left: 0 } }));
    const parsed = clipboard.read();
    expect(parsed.ok && parsed.style.look).toEqual({ blend: 'multiply', crop: { top: 0.2, right: 0, bottom: 0, left: 0 } });
  });
});

describe('gestes : rendu étendu', () => {
  const recorded = (editor, run) => {
    const seen = [];
    const off = editor.onOperation((op) => seen.push(op));
    run();
    off();
    return seen.map((operation) => operationToStep(operation, { kindOf: () => 'rain' }).step);
  };

  test('un réglage de rendu devient une étape qui se rejoue sur une autre sélection', () => {
    const editor = make();
    const [step] = recorded(editor, () => editor.setLayers(['a'], { blend: 'overlay', rotation: 7 }));
    expect(step).toMatchObject({ op: 'layer', args: { patch: { blend: 'overlay', rotation: 7 } } });
    editor.select(['b']);
    expect(applyStep(step, editor).ok).toBe(true);
    expect(layer(editor, 'b')).toMatchObject({ blend: 'overlay', rotation: 7 });
  });

  test('deux côtés de rognage réglés l’un après l’autre se rassemblent en une étape', () => {
    const editor = make();
    const [first, second] = recorded(editor, () => {
      editor.setLayers(['a'], { crop: { top: 0.1 } });
      editor.setLayers(['a'], { crop: { left: 0.3 } });
    });
    const merged = mergeSteps(first, second);
    expect(merged.args.patch.crop).toEqual({ top: 0.1, left: 0.3 });
  });

  test('la description raconte le rendu, les champs exposent un choix pour la fusion et un champ par côté de rognage', () => {
    const step = { op: 'layer', target: 'selection', args: { patch: { blend: 'screen', rotation: 12, blur: 3, crop: { top: 0.1 } } } };
    const text = describeStep(step);
    expect(text).toContain('fusion Superposition claire');
    expect(text).toContain('rotation 12°');
    expect(text).toContain('flou 3 px');
    expect(text).toContain('rognage haut 10 %');
    const fields = stepFields(step);
    expect(fields.find((f) => f.key === 'blend')).toMatchObject({ type: 'choice', value: 'screen' });
    expect(fields.filter((f) => f.key.startsWith('crop.')).map((f) => f.key)).toEqual(['crop.top', 'crop.right', 'crop.bottom', 'crop.left']);
    const edited = withStepValue(step, 'crop.left', 0.25);
    expect(edited.args.patch.crop).toEqual({ top: 0.1, left: 0.25 });
    expect(step.args.patch.crop).toEqual({ top: 0.1 });
  });

  test('les étapes de rendu invalides sont refusées avec une raison', () => {
    const bad = (patch) => stepErrors({ op: 'layer', args: { patch } });
    expect(bad({ blend: 'screen', rotation: 10, blur: 2, crop: { top: 0.2 } })).toEqual([]);
    expect(bad({ blend: 'dissolve' })[0]).toContain('fusion');
    expect(bad({ rotation: 400 })[0]).toContain('rotation');
    expect(bad({ blur: 50 })[0]).toContain('flou');
    expect(bad({ crop: { top: 0.95 } })[0]).toContain('rognage');
    expect(bad({ crop: { middle: 0.1 } })[0]).toContain('rognage');
  });
});

describe('récapitulatif de publication : rendu étendu', () => {
  test('chaque changement de rendu est nommé avec l’avant et l’après', () => {
    const before = scene([effect('a')]);
    const after = scene([effect('a', 'rain', { blend: 'multiply', rotation: 5, blur: 2, crop: { top: 0.1, right: 0, bottom: 0, left: 0 } })]);
    const [change] = diffScenes(before, after, { labelOf: (kind) => kind, optionLabel: (_kind, key) => key });
    expect(change.details).toEqual(expect.arrayContaining([
      'fusion : Normal → Produit', 'rotation : 0° → 5°', 'flou : 0 px → 2 px', 'rognage haut : 0 % → 10 %',
    ]));
  });
});

describe('vignettes : rendu étendu', () => {
  const { lookOfStyles } = require('./preset-thumbnail.js');
  const style = (over = {}) => ({ opacity: '1', mixBlendMode: 'normal', transform: 'none', clipPath: 'none', filter: 'none', ...over });

  test('un canvas sans rendu étendu se peint comme avant : opacité cumulée seulement', () => {
    const look = lookOfStyles([style({ opacity: '0.5' }), style({ opacity: '0.5' })]);
    expect(look).toMatchObject({ alpha: 0.25, extended: false, angle: 0, blurPx: 0, inset: null, composite: 'source-over' });
  });

  test('fusion, rotation, flou et rognage calculés par le navigateur sont repris pour peindre la vignette', () => {
    const angle = (12 * Math.PI) / 180;
    const matrix = `matrix(${Math.cos(angle)}, ${Math.sin(angle)}, ${-Math.sin(angle)}, ${Math.cos(angle)}, 0, 0)`;
    const look = lookOfStyles([style({ mixBlendMode: 'screen', transform: matrix, filter: 'blur(4px)', clipPath: 'inset(10% 0% 0% 25%)' })]);
    expect(look.extended).toBe(true);
    expect(look.composite).toBe('screen');
    expect(look.angle).toBeCloseTo(angle, 6);
    expect(look.blurPx).toBe(4);
    expect(look.inset).toEqual({ top: 0.1, right: 0, bottom: 0, left: 0.25 });
  });

  test('la vignette d’une couche seule dans la pile n’affiche pas son rendu étendu : c’est l’effet lui-même', () => {
    const { withoutLook } = require('../scene-doc.js');
    expect(withoutLook(effect('a', 'rain', { blend: 'screen', rotation: 3, blur: 1, crop: { top: 0.1, right: 0, bottom: 0, left: 0 }, opacity: 0.5 }))).toEqual(effect('a', 'rain', { opacity: 0.5 }));
  });
});
