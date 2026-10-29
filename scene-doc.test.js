import { describe, expect, test } from 'bun:test';
import {
  canonicalSceneDoc,
  createLayer,
  FULL_PLACEMENT,
  MAX_LAYERS,
  presetFromScene,
  readPath,
  sceneFromPreset,
  validateSceneDoc,
  writePath,
} from './scene-doc.js';

const preset = {
  id: 'pluie-lente',
  name: 'Pluie lente',
  component: 'rain',
  options: { speed: 1.5 },
  tags: ['coding'],
  transition: { type: 'fade', durationMs: 600, direction: 'right', easing: 'easeInOut' },
  showBranding: true,
};

const scene = () => sceneFromPreset(preset);
const errorsOf = (raw) => (validateSceneDoc(raw).ok ? [] : validateSceneDoc(raw).errors);

describe('preset ↔ scène à une couche', () => {
  test('un preset devient une scène d’une couche pleine page, sans rien perdre', () => {
    expect(scene()).toEqual({
      version: 1,
      id: 'pluie-lente',
      name: 'Pluie lente',
      tags: ['coding'],
      transition: preset.transition,
      showBranding: true,
      layers: [{ id: 'main', kind: 'rain', visible: true, opacity: 1, placement: FULL_PLACEMENT, options: { speed: 1.5 } }],
    });
    expect(validateSceneDoc(scene()).ok).toBe(true);
  });

  test('l’aller-retour rend le preset d’origine', () => {
    expect(presetFromScene(scene())).toEqual(preset);
  });

  test('un preset sans transition ni branding n’en gagne pas', () => {
    const bare = sceneFromPreset({ id: 'a', name: 'A', component: 'bubble', options: {} });
    expect(Object.keys(bare)).toEqual(['version', 'id', 'name', 'layers']);
  });

  test('une scène de plusieurs couches n’est pas un preset', () => {
    const many = { ...scene(), layers: [...scene().layers, createLayer({ id: 'deux', kind: 'bubble' })] };
    expect(presetFromScene(many)).toBeNull();
  });

  test('l’ancien nom d’un type est lu, pas rejeté', () => {
    const legacy = sceneFromPreset({ ...preset, component: 'RainBackground' });
    expect(legacy.layers[0].kind).toBe('rain');
  });
});

describe('validation', () => {
  test('la scène d’un preset est valide', () => {
    expect(validateSceneDoc(scene())).toEqual({ ok: true });
  });

  test('une version inconnue, un nom vide ou un identifiant de scène invalide sont signalés', () => {
    expect(errorsOf({ ...scene(), version: 2 })).toContain('version : 1 attendue');
    expect(errorsOf({ ...scene(), name: '  ' })).toContain('name : texte non vide attendu');
    expect(errorsOf({ ...scene(), id: 'a.b' })).toContain('id : identifiant de scène invalide');
  });

  test('zéro couche ou plus de huit couches sont refusés', () => {
    expect(errorsOf({ ...scene(), layers: [] })).toContain('layers : au moins une couche');
    const nine = Array.from({ length: MAX_LAYERS + 1 }, (_, index) => createLayer({ id: `c${index}`, kind: 'rain' }));
    expect(errorsOf({ ...scene(), layers: nine })).toContain(`layers : ${MAX_LAYERS} couches au plus`);
    const eight = nine.slice(0, MAX_LAYERS);
    expect(validateSceneDoc({ ...scene(), layers: eight }).ok).toBe(true);
  });

  test('un identifiant de couche dupliqué ou contenant un point est refusé', () => {
    const twins = [createLayer({ id: 'x', kind: 'rain' }), createLayer({ id: 'x', kind: 'bubble' })];
    expect(errorsOf({ ...scene(), layers: twins })).toContain('layers[x] : identifiant dupliqué');
    expect(errorsOf({ ...scene(), layers: [createLayer({ id: 'a.b', kind: 'rain' })] }))
      .toContain('layers[a.b] : identifiant de couche invalide');
  });

  test('un type inconnu, une visibilité ou une opacité mal typées sont nommés par couche', () => {
    const layer = { ...scene().layers[0], kind: 'fantome', visible: 'oui', opacity: 'x' };
    const errors = errorsOf({ ...scene(), layers: [layer] });
    expect(errors).toContain('layers[main].kind : type de couche inconnu');
    expect(errors).toContain('layers[main].visible : booléen attendu');
    expect(errors).toContain('layers[main].opacity : nombre attendu');
  });

  test('le placement doit être fait de nombres et de dimensions positives', () => {
    const bad = { ...scene().layers[0], placement: { x: 0, y: 'a', width: 0, height: 1 } };
    const errors = errorsOf({ ...scene(), layers: [bad] });
    expect(errors).toContain('layers[main].placement.y : nombre attendu');
    expect(errors).toContain('layers[main].placement.width : supérieur à 0 attendu');
  });

  test('les options sont validées par le schéma du type de la couche, avec le nom de la couche', () => {
    const layer = { ...scene().layers[0], options: { speed: 'abc' } };
    expect(errorsOf({ ...scene(), layers: [layer] })).toContain('layers[main].options.speed : nombre attendu');
  });
});

describe('forme canonique', () => {
  test('anciens noms et valeurs sont ramenés à la forme neutre, les bornes appliquées', () => {
    const raw = {
      ...scene(),
      layers: [{ ...scene().layers[0], kind: 'BubbleBackground', opacity: 3, options: { audioReactive: 'Oui', count: 9999 },
        placement: { x: 0, y: 0, width: 50, height: 0 } }],
    };
    const [layer] = canonicalSceneDoc(raw).layers;
    expect(layer.kind).toBe('bubble');
    expect(layer.options).toEqual({ audioReactive: true, count: 200 });
    expect(layer.opacity).toBe(1);
    expect(layer.placement.width).toBe(2);
    expect(layer.placement.height).toBe(0.001);
  });

  test('la scène reçue n’est pas modifiée et les champs inconnus sont conservés', () => {
    const raw = { ...scene(), futur: { a: 1 }, layers: [{ ...scene().layers[0], enter: { type: 'fade' } }] };
    const copy = structuredClone(raw);
    const canonical = canonicalSceneDoc(raw);
    expect(raw).toEqual(copy);
    expect(canonical.futur).toEqual({ a: 1 });
    expect(canonical.layers[0].enter).toEqual({ type: 'fade' });
  });
});

describe('chemins adressables', () => {
  const many = () => ({
    ...scene(),
    layers: [scene().layers[0], createLayer({ id: 'coin', kind: 'bubble', options: { count: 20 } })],
  });

  test('lit une option, l’opacité, un placement et une propriété de la scène', () => {
    expect(readPath(many(), 'layers[main].options.speed')).toEqual({ ok: true, value: 1.5 });
    expect(readPath(many(), 'layers[coin].opacity')).toEqual({ ok: true, value: 1 });
    expect(readPath(many(), 'layers[coin].placement.width')).toEqual({ ok: true, value: 1 });
    expect(readPath(many(), 'name')).toEqual({ ok: true, value: 'Pluie lente' });
  });

  test('écrit sans modifier la scène reçue ni les autres couches', () => {
    const before = many();
    const copy = structuredClone(before);
    const result = writePath(before, 'layers[coin].options.count', 40);
    expect(result.ok).toBe(true);
    expect(before).toEqual(copy);
    expect(result.scene.layers[1].options).toEqual({ count: 40 });
    expect(result.scene.layers[0]).toBe(before.layers[0]);
  });

  test('écrit une visibilité, une opacité et une position de couche', () => {
    let current = many();
    for (const [path, value] of [['layers[coin].visible', false], ['layers[coin].opacity', 0.4], ['layers[coin].placement.x', 0.7]]) {
      const result = writePath(current, path, value);
      expect(result.ok).toBe(true);
      current = result.scene;
    }
    expect(current.layers[1]).toMatchObject({ visible: false, opacity: 0.4, placement: { x: 0.7, width: 1 } });
  });

  test('un chemin inconnu ou une couche absente est une erreur, jamais une écriture silencieuse', () => {
    expect(writePath(many(), 'layers[coin].kind', 'rain').ok).toBe(false);
    expect(writePath(many(), 'layers[coin].id', 'autre').ok).toBe(false);
    expect(writePath(many(), 'layers[absente].opacity', 1)).toEqual({ ok: false, error: 'couche introuvable : absente' });
    expect(readPath(many(), 'layers[coin]')).toEqual({ ok: false, error: 'chemin invalide : layers[coin]' });
  });

  test('les clés qui polluent un prototype sont refusées', () => {
    expect(writePath(many(), 'layers[coin].options.__proto__', { x: 1 }).ok).toBe(false);
    expect(writePath(many(), 'layers[coin].options.constructor', 1).ok).toBe(false);
    expect({}.x).toBeUndefined();
  });
});
