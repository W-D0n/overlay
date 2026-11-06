import { describe, expect, test } from 'bun:test';
import { LOOK_KEYS, canonicalSceneDoc, validateSceneDoc, withoutLook } from '../scene/scene-doc.js';
import { createSceneEditor } from '../../studio/editor/scene-editor.js';
import { createSceneRuntime } from '../scene/scene-runtime.js';

const layer = (extra = {}) => ({ id: 'a', kind: 'text', visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: {}, ...extra });
const doc = (...layers) => ({ version: 1, id: 's', name: 's', layers });
const mask = { shape: 'ellipse', x: 0.1, y: 0.1, width: 0.5, height: 0.5, feather: 0.2 };

describe('mask in the scene document', () => {
  test('is part of the look: kept by the look keys, removed by withoutLook', () => {
    expect(LOOK_KEYS).toContain('mask');
    expect('mask' in withoutLook(layer({ mask }))).toBe(false);
  });

  test('a valid mask passes, an invalid one is refused with its path', () => {
    expect(validateSceneDoc(doc(layer({ mask }))).ok).toBe(true);
    const result = validateSceneDoc(doc(layer({ mask: { shape: 'star' } })));
    expect(result.ok).toBe(false);
    expect(result.errors.join()).toContain('mask');
  });

  test('canonical form: bounded, and a mask that shows everything disappears', () => {
    expect(canonicalSceneDoc(doc(layer({ mask: { ...mask, x: -4 } }))).layers[0].mask.x).toBe(0);
    expect('mask' in canonicalSceneDoc(doc(layer({ mask: { shape: 'rectangle', x: 0, y: 0, width: 1, height: 1, feather: 0 } }))).layers[0]).toBe(false);
  });

  test('a group can carry a mask', () => {
    const scene = doc(layer({ id: 'm', group: 'g' }), layer({ id: 'g', kind: 'group', options: {}, mask }));
    expect(validateSceneDoc(scene).ok).toBe(true);
  });
});

describe('mask in the editor', () => {
  const editor = () => createSceneEditor({ scene: doc(layer()) });

  test('setting it is one undoable step named after the mask; removing it clears the key', () => {
    const e = editor();
    expect(e.setLayers(['a'], { mask }).ok).toBe(true);
    expect(e.state().scene.layers[0].mask).toEqual(mask);
    expect(e.setLayers(['a'], { mask: undefined }).ok).toBe(true);
    expect('mask' in e.state().scene.layers[0]).toBe(false);
    e.undo();
    expect(e.state().scene.layers[0].mask).toEqual(mask);
  });

  test('resetting the look takes the mask away with the rest', () => {
    const e = editor();
    e.setLayers(['a'], { mask });
    e.resetLayers(['a']);
    expect('mask' in e.state().scene.layers[0]).toBe(false);
  });

  test('an invalid mask is refused and changes nothing', () => {
    const e = editor();
    expect(e.setLayers(['a'], { mask: { shape: 'star' } }).ok).toBe(false);
    expect('mask' in e.state().scene.layers[0]).toBe(false);
  });
});

describe('mask in the runtime', () => {
  function setup() {
    const calques = [];
    const runtime = createSceneRuntime({ appendChild() {} }, {
      registry: { text: () => ({ el: {}, update() {}, destroy() {} }) },
      clock: { subscribe: () => () => {} },
      createStageCalque: () => ({ style: {}, appendChild() {}, remove() {} }),
      createCalque: () => {
        const calque = { style: {}, appendChild() {}, remove() {} };
        calques.push(calque);
        return calque;
      },
    });
    return { runtime, calques };
  }

  test('the calque gets the mask CSS, and loses it when the mask goes', () => {
    const { runtime, calques } = setup();
    runtime.apply(doc(layer({ mask })));
    expect(calques[0].style.maskImage).toContain('radial-gradient(ellipse 25% 25% at 35% 35%');
    expect(calques[0].style.maskComposite).toBe('');
    runtime.apply(doc(layer()));
    expect(calques[0].style.maskImage).toBe('');
  });

  test('a rectangle mask sets how its two fades combine', () => {
    const { runtime, calques } = setup();
    runtime.apply(doc(layer({ mask: { shape: 'rectangle', x: 0.1, y: 0.1, width: 0.5, height: 0.5, feather: 0 } })));
    expect(calques[0].style.maskComposite).toBe('intersect');
    runtime.apply(doc(layer({ mask: { shape: 'rectangle', x: 0.1, y: 0.1, width: 0.5, height: 0.5, feather: 0, invert: true } })));
    expect(calques[0].style.maskComposite).toBe('add');
  });
});
