import { describe, expect, test } from 'bun:test';
import { createSceneEditor } from '../../studio/editor/scene-editor.js';
import { diffScenes } from '../../studio/editor/scene-diff.js';
import { LOOK_KEYS, canonicalSceneDoc, createLayer, currentFromScene, validateSceneDoc, withoutLook } from '../scene/scene-doc.js';
import { createSceneRuntime } from '../scene/scene-runtime.js';

const GLOW = { color: '#c8b97a', size: 16, intensity: 0.8 };
const scene = (filters, extra = {}) => ({ version: 1, id: 's', name: 'S', layers: [createLayer({ id: 'a', kind: 'text', options: {}, filters, ...extra })] });

describe('dans le document de scène', () => {
  test('une couche porte ses filtres, la scène reste valide', () => {
    expect(validateSceneDoc(scene({ hue: 30, glow: GLOW })).ok).toBe(true);
    expect(validateSceneDoc(scene(undefined)).ok).toBe(true);
  });

  test('des filtres invalides refusent la scène, avec le chemin du défaut', () => {
    const result = validateSceneDoc(scene({ brightness: 9 }));
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('layers[a].filters.brightness');
    expect(validateSceneDoc(scene({ glow: { color: 'x', size: 1, intensity: 1 } })).errors[0]).toContain('layers[a].filters.glow.color');
  });

  test('la forme canonique normalise et retire des filtres neutres ; withoutLook les retire ; la couche n\'est plus « simple »', () => {
    expect(canonicalSceneDoc(scene({ brightness: 1.2345, glow: { ...GLOW, color: '#C8B97A' } })).layers[0].filters).toEqual({ brightness: 1.23, glow: GLOW });
    expect('filters' in canonicalSceneDoc(scene({ brightness: 1, hue: 0 })).layers[0]).toBe(false);
    expect('filters' in withoutLook(createLayer({ id: 'a', kind: 'text', filters: { hue: 5 } }))).toBe(false);
    expect(LOOK_KEYS).toContain('filters');
    expect(currentFromScene(scene(undefined))).not.toBeNull();
    expect(currentFromScene(scene({ hue: 5 }))).toBeNull();
  });
});

describe('édition et publication', () => {
  test('l\'éditeur règle les filtres d\'une couche, avec son libellé d\'historique, et les annule', () => {
    const editor = createSceneEditor({ scene: scene(undefined) });
    expect(editor.setLayers(['a'], { filters: { contrast: 1.4 } }).ok).toBe(true);
    expect(editor.state().scene.layers[0].filters).toEqual({ contrast: 1.4 });
    expect(editor.state().undoLabel).toBe('Filtres de la couche');
    editor.undo();
    expect(editor.state().scene.layers[0].filters).toBeUndefined();
  });

  test("l'éditeur ramène une valeur hors bornes à la borne, et refuse un mauvais type sans toucher à la scène", () => {
    const editor = createSceneEditor({ scene: scene(undefined) });
    expect(editor.setLayers(['a'], { filters: { hue: 999 } }).ok).toBe(true);
    expect(editor.state().scene.layers[0].filters).toEqual({ hue: 180 });
    expect(editor.setLayers(['a'], { filters: { hue: /** @type {*} */ ('x') } }).ok).toBe(false);
    expect(editor.state().scene.layers[0].filters).toEqual({ hue: 180 });
  });

  test('le récapitulatif de publication nomme les filtres changés', () => {
    const changes = diffScenes(scene(undefined), scene({ brightness: 1.2, hue: 10, glow: GLOW }));
    expect(changes[0].details).toContain('filtres : aucun → luminosité, teinte, lueur');
    expect(diffScenes(scene({ hue: 10 }), scene(undefined))[0].details).toContain('filtres : teinte → aucun');
    expect(diffScenes(scene({ hue: 10 }), scene({ hue: 10 }))).toEqual([]);
  });
});

describe('dans le moteur', () => {
  function mountedStyle(layer) {
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
    runtime.apply({ version: 1, id: 's', name: 'S', layers: [layer] });
    return calques[0].style;
  }

  test('sans filtre ni flou, aucun filtre CSS', () => {
    expect(mountedStyle(createLayer({ id: 'a', kind: 'text' })).filter).toBe('');
  });

  test('le flou seul se rend comme avant', () => {
    expect(mountedStyle(createLayer({ id: 'a', kind: 'text', blur: 4 })).filter).toBe('blur(calc(var(--reference-scale, 1) * 4px))');
  });

  test('les filtres se rendent sur le calque, avant le flou', () => {
    const style = mountedStyle(createLayer({ id: 'a', kind: 'text', blur: 4, filters: { brightness: 1.2, glow: GLOW } }));
    expect(style.filter).toBe('brightness(1.2) drop-shadow(0 0 calc(var(--reference-scale, 1) * 16px) rgba(200, 185, 122, 0.8)) blur(calc(var(--reference-scale, 1) * 4px))');
  });

  test('les filtres seuls, sans flou', () => {
    expect(mountedStyle(createLayer({ id: 'a', kind: 'text', filters: { saturation: 0 } })).filter).toBe('saturate(0)');
  });
});
