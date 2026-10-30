import { describe, expect, test } from 'bun:test';
import { LAYER_KINDS } from '../layer-kinds.js';
import { MAX_LAYERS, validateSceneDoc } from '../scene-doc.js';
import { LOAD_KIND_ORDER, buildLoadScene, parseLoadUrl } from './charge-scene.js';

describe('buildLoadScene', () => {
  test('produit N couches pleine taille aux identifiants distincts', () => {
    const scene = buildLoadScene(3);
    expect(scene.layers.map((layer) => layer.kind)).toEqual(['dotgrid', 'fireflies', 'rain']);
    expect(new Set(scene.layers.map((layer) => layer.id)).size).toBe(3);
    for (const layer of scene.layers) expect(layer.placement).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  test('chaque couche reçoit les valeurs par défaut de son type', () => {
    const [layer] = buildLoadScene(1).layers;
    const defaults = Object.fromEntries(LAYER_KINDS.dotgrid.fields.map((field) => [field.key, field.default]));
    expect(layer.options).toEqual(defaults);
  });

  test('la scène produite est un document de scène valide, de 1 couche à la borne', () => {
    for (let count = 1; count <= MAX_LAYERS; count += 1) {
      expect(validateSceneDoc(buildLoadScene(count)).ok).toBe(true);
    }
  });

  test('refuse un nombre hors borne', () => {
    expect(() => buildLoadScene(MAX_LAYERS + 1)).toThrow(RangeError);
    expect(() => buildLoadScene(-1)).toThrow(RangeError);
  });

  test('reprend les types nommés en boucle', () => {
    expect(buildLoadScene(3, ['rain']).layers.map((layer) => layer.kind)).toEqual(['rain', 'rain', 'rain']);
  });

  test('la liste par défaut couvre la borne', () => {
    expect(LOAD_KIND_ORDER.length).toBeGreaterThanOrEqual(MAX_LAYERS);
  });
});

describe('parseLoadUrl', () => {
  test('valeurs par défaut : 1 couche, compteur affiché', () => {
    expect(parseLoadUrl('')).toEqual({ count: 1, kinds: [...LOAD_KIND_ORDER], hud: true });
  });

  test('couches bornées, types inconnus ignorés, hud=0', () => {
    expect(parseLoadUrl('?couches=99&types=rain,nimporte,dotgrid&hud=0')).toEqual({ count: MAX_LAYERS, kinds: ['rain', 'dotgrid'], hud: false });
    expect(parseLoadUrl('?couches=abc').count).toBe(1);
    expect(parseLoadUrl('?couches=0').count).toBe(0);
  });
});
