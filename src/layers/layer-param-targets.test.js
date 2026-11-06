import { describe, expect, test } from 'bun:test';
import {
  BINDING_TARGETS, bindingErrors, canonicalBindings, changeBinding, createBinding, isTargetId, layerTargets, paramBase, paramTargets, targetLabel, targetRange,
} from './layer-bindings.js';
import { canonicalTracks, changeKey, evaluateTimeline, setKey, trackErrors } from './layer-timeline.js';
import { canonicalSceneDoc, createLayer, validateSceneDoc } from '../scene/scene-doc.js';
import { createSceneRuntime } from '../scene/scene-runtime.js';
import { describeKey, valueAt } from '../../dev/timeline-view.js';

const SPEC = JSON.stringify([
  { key: 'taille', label: 'Taille', type: 'number', default: 40, min: 10, max: 200, step: 5 },
  { key: 'vitesse', label: 'Vitesse', type: 'number', default: 0.5, min: 0, max: 1 },
  { key: 'libre', label: 'Libre', type: 'number', default: 3 },
  { key: 'sansMin', label: 'Sans min', type: 'number', default: 3, max: 10 },
  { key: 'sansMax', label: 'Sans max', type: 'number', default: 3, min: 0 },
  { key: 'fige', label: 'Figé', type: 'number', default: 5, min: 5, max: 5 },
  { key: 'large', label: 'Large', type: 'number', default: 20, min: 0, max: 150 },
  { key: 'titre', label: 'Titre', type: 'text', default: 'Salut' },
]);
const owner = { kind: 'code', options: { paramSpec: SPEC, params: { taille: 80 } } };

describe('cibles de réglage : quels réglages se pilotent', () => {
  test('seuls les nombres déclarés avec min et max sont pilotables, avec leurs bornes', () => {
    expect(paramTargets(owner).map(({ id }) => id)).toEqual(['param:taille', 'param:vitesse', 'param:large']);
    expect(targetRange('param:taille', owner)).toEqual({ label: 'Réglage : Taille', unit: '', min: 10, max: 200, step: 5, from: 40, to: 200 });
  });

  test('sans pas déclaré, le pas découpe l’intervalle en une centaine de pas (puissance de dix)', () => {
    expect(targetRange('param:vitesse', owner)).toMatchObject({ min: 0, max: 1, step: 0.01, from: 0.5, to: 1 });
    expect(targetRange('param:large', owner)).toMatchObject({ min: 0, max: 150, step: 1 });
  });

  test('il faut les deux bornes, et un intervalle qui s’étend : un seul côté ou une valeur figée ne s’anime pas', () => {
    for (const key of ['sansMin', 'sansMax', 'fige']) expect(targetRange(`param:${key}`, owner)).toBeNull();
  });

  test('une couche Shader expose ses réglages bornés comme une couche Code', () => {
    expect(paramTargets({ kind: 'shader', options: { paramSpec: SPEC } }).map(({ id }) => id)).toEqual(['param:taille', 'param:vitesse', 'param:large']);
  });

  test('une couche qui n’est pas une couche Code ni Shader, sans déclaration ou à déclaration invalide n’a aucun réglage pilotable', () => {
    expect(paramTargets({ kind: 'text', options: { paramSpec: SPEC } })).toEqual([]);
    expect(paramTargets({ kind: 'code', options: {} })).toEqual([]);
    expect(paramTargets({ kind: 'code', options: { paramSpec: '[ {' } })).toEqual([]);
    expect(paramTargets(null)).toEqual([]);
  });

  test('un réglage absent ou non numérique n’a pas de bornes ; une valeur commune garde les siennes sans couche', () => {
    expect(targetRange('param:libre', owner)).toBeNull();
    expect(targetRange('param:titre', owner)).toBeNull();
    expect(targetRange('param:fantome', owner)).toBeNull();
    expect(targetRange('scale')).toBe(BINDING_TARGETS.scale);
  });

  test('les listes proposées : les six communes puis les réglages', () => {
    expect(layerTargets(null).map(({ id }) => id)).toEqual(['opacity', 'rotation', 'blur', 'scale', 'x', 'y', 'filter:brightness', 'filter:contrast', 'filter:saturation', 'filter:hue', 'filter:glow']);
    expect(layerTargets(owner).map(({ id }) => id)).toEqual(['opacity', 'rotation', 'blur', 'scale', 'x', 'y', 'filter:brightness', 'filter:contrast', 'filter:saturation', 'filter:hue', 'filter:glow', 'param:taille', 'param:vitesse', 'param:large']);
  });

  test('forme d’un identifiant', () => {
    for (const good of ['scale', 'filter:hue', 'filter:glow', 'param:taille', 'param:a', 'param:aB_9']) expect(isTargetId(good)).toBe(true);
    for (const bad of ['filter:', 'filter:size', 'filter:Hue', 'param:', 'param:Taille', 'param:1a', 'param:a b', 'inconnue', 'param:' + 'a'.repeat(33), 3, null, undefined]) expect(isTargetId(bad)).toBe(false);
  });

  test('noms : le libellé de la déclaration, sinon la clé', () => {
    expect(targetLabel('param:taille', owner)).toBe('Réglage : Taille');
    expect(targetLabel('param:taille')).toBe('Réglage : taille');
    expect(targetLabel('scale')).toBe('Échelle');
  });

  test('la base d’un réglage est sa valeur réglée à la main, sinon son défaut ; une valeur commune n’en a pas', () => {
    expect(paramBase(owner, 'param:taille')).toBe(80);
    expect(paramBase(owner, 'param:vitesse')).toBe(0.5);
    expect(paramBase(owner, 'param:titre')).toBeNull();
    expect(paramBase(owner, 'scale')).toBeNull();
  });
});

describe('cibles de réglage : liaisons', () => {
  test('la validation accepte un réglage bien formé, même que la couche ne déclare pas (la déclaration peut changer)', () => {
    const binding = { source: 'audio', target: 'param:taille', from: 40, to: 200, durationMs: 100 };
    expect(bindingErrors('b', [binding])).toEqual([]);
    expect(bindingErrors('b', [{ ...binding, target: 'param:Mauvais' }])).toEqual(['b[0].target : valeur liée inconnue']);
  });

  test('une liaison neuve part du défaut du réglage jusqu’à son maximum', () => {
    expect(createBinding('audio', 'param:taille', owner)).toEqual({ source: 'audio', target: 'param:taille', from: 40, to: 200, durationMs: 120 });
  });

  test('la forme canonique borne de et à sur la déclaration ; sans la couche elle ne touche pas à un réglage', () => {
    const binding = { source: 'audio', target: 'param:taille', from: -5, to: 9999, durationMs: 100 };
    expect(canonicalBindings([binding], owner)).toEqual([{ ...binding, from: 10, to: 200 }]);
    expect(canonicalBindings([binding])).toEqual([binding]);
  });

  test('changer la cible pour un réglage reprend ses bornes ; un réglage inconnu de la couche est refusé', () => {
    const list = [createBinding('audio', 'scale')];
    expect(changeBinding(list, 0, 'target', 'param:taille', owner)[0]).toMatchObject({ target: 'param:taille', from: 40, to: 200 });
    expect(changeBinding(list, 0, 'target', 'param:fantome', owner)).toEqual(list);
    expect(changeBinding(list, 0, 'target', 'param:taille')).toEqual(list);
  });
});

describe('cibles de réglage : timeline', () => {
  const key = (t, v) => ({ t, v, ease: 'linear' });

  test('la validation accepte les pistes d’un réglage et refuse une cible mal formée', () => {
    expect(trackErrors('t', [{ target: 'param:taille', keys: [key(0, 40)] }])).toEqual([]);
    expect(trackErrors('t', [{ target: 'param:', keys: [key(0, 40)] }])).toEqual(['t[0].target : valeur animée inconnue']);
  });

  test('la forme canonique borne les clés sur la déclaration de la couche', () => {
    const tracks = [{ target: 'param:taille', keys: [key(0, -1), key(500, 9999)] }];
    expect(canonicalTracks(tracks, owner)[0].keys.map(({ v }) => v)).toEqual([10, 200]);
    expect(canonicalTracks(tracks)[0].keys.map(({ v }) => v)).toEqual([-1, 9999]);
  });

  test('poser et modifier une clé respecte les bornes données, ou aucune', () => {
    const range = targetRange('param:taille', owner);
    const [first] = setKey([], 'param:taille', 0, 5000, 'linear', range);
    expect(first.keys[0].v).toBe(200);
    expect(setKey([], 'param:taille', 0, 5000, 'linear', null)[0].keys[0].v).toBe(5000);
    expect(setKey([], 'param:taille', 0, 5000)[0].keys[0].v).toBe(5000);
    expect(changeKey(first && [first], 'param:taille', 0, { v: -3 }, range).tracks[0].keys[0].v).toBe(10);
    expect(setKey([], 'scale', 0, 99)[0].keys[0].v).toBe(3);
  });

  test('l’évaluation donne la valeur du réglage à l’instant', () => {
    const tracks = [{ target: 'param:taille', keys: [key(0, 10), key(1000, 110)] }];
    expect(evaluateTimeline(tracks, 500)).toEqual({ 'param:taille': 60 });
  });

  test('l’éditeur : une clé posée sans rien changer part de la valeur réglée ; le nom d’une clé dit le réglage', () => {
    const layer = { ...createLayer({ id: 'c', kind: 'code' }), options: owner.options };
    expect(valueAt(layer, 'param:taille', 300)).toBe(80);
    expect(valueAt(layer, 'param:vitesse', 300)).toBe(0.5);
    expect(valueAt(layer, 'scale', 300)).toBe(1);
    expect(describeKey('param:taille', key(1500, 60), owner)).toBe('Image clé réglage : taille à 1,50 s, valeur 60');
  });
});

describe('cibles de réglage : le document', () => {
  test('une scène avec une piste et une liaison sur un réglage est valide et se canonise sur les bornes de la couche', () => {
    const layer = createLayer({
      id: 'c', kind: 'code',
      timeline: [{ target: 'param:taille', keys: [{ t: 0, v: 1, ease: 'linear' }, { t: 1000, v: 999, ease: 'linear' }] }],
      bindings: [{ source: 'audio', target: 'param:vitesse', from: -1, to: 5, durationMs: 100 }],
    });
    const scene = { version: 1, id: 's', name: 'S', layers: [{ ...layer, options: { ...layer.options, paramSpec: SPEC } }] };
    expect(validateSceneDoc(scene)).toEqual({ ok: true });
    const [canonical] = canonicalSceneDoc(scene).layers;
    expect(canonical.timeline[0].keys.map(({ v }) => v)).toEqual([10, 200]);
    expect(canonical.bindings[0]).toMatchObject({ from: 0, to: 1 });
  });
});

describe('cibles de réglage : moteur', () => {
  /** Un monde factice : une couche qui retient ce qu'on lui impose, une horloge qu'on avance à la main. */
  function setup({ drivable = true } = {}) {
    const driven = [];
    const listeners = new Set();
    let time = 0;
    const clock = { subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
    const instance = { el: {}, update() {}, destroy() {} };
    if (drivable) instance.drive = (values) => driven.push(values);
    const runtime = createSceneRuntime({ appendChild() {} }, {
      registry: { code: () => instance },
      clock,
      createStageCalque: () => ({ style: {}, appendChild() {}, remove() {} }),
      createCalque: () => ({ style: {}, appendChild() {}, remove() {} }),
    });
    const frame = (seconds) => {
      const dt = seconds - time;
      time = seconds;
      for (const listener of [...listeners]) listener({ dt, time, pixelRatio: 1 });
    };
    return { runtime, driven, frame };
  }
  const withTrack = (extra = {}) => createLayer({
    id: 'c', kind: 'code', timeline: [{ target: 'param:taille', keys: [{ t: 0, v: 10, ease: 'linear' }, { t: 1000, v: 110, ease: 'linear' }] }], ...extra,
  });
  const scene = (...layers) => ({ version: 1, id: 's', name: 'S', layers });

  test('la valeur animée d’un réglage va au composant, sous sa clé nue, à chaque image qui la change', () => {
    const { runtime, driven, frame } = setup();
    runtime.apply(scene(withTrack()));
    frame(0.5);
    expect(driven.at(-1)).toEqual({ taille: 60 });
    frame(1);
    expect(driven.at(-1)).toEqual({ taille: 110 });
  });

  test('une liaison sur un réglage va aussi au composant, et l’emporte sur la timeline', () => {
    const { runtime, driven, frame } = setup();
    runtime.apply(scene(withTrack({ bindings: [{ source: 'event:raid', target: 'param:taille', from: 5, to: 5, durationMs: 100 }] })));
    frame(0.5);
    expect(driven.at(-1)).toEqual({ taille: 5 });
  });

  test('retirer la piste rend au composant les valeurs réglées à la main', () => {
    const { runtime, driven, frame } = setup();
    runtime.apply(scene(withTrack()));
    frame(0.5);
    runtime.apply(scene(createLayer({ id: 'c', kind: 'code' })));
    expect(driven.at(-1)).toEqual({});
  });

  test('une valeur commune animée n’est pas confondue avec un réglage', () => {
    const { runtime, driven, frame } = setup();
    runtime.apply(scene(createLayer({ id: 'c', kind: 'code', timeline: [{ target: 'opacity', keys: [{ t: 0, v: 0, ease: 'linear' }, { t: 1000, v: 1, ease: 'linear' }] }] })));
    frame(0.5);
    expect(driven.every((values) => Object.keys(values).length === 0)).toBe(true);
  });

  test('un composant sans « drive » n’est pas dérangé', () => {
    const { runtime, frame } = setup({ drivable: false });
    runtime.apply(scene(withTrack()));
    expect(() => frame(0.5)).not.toThrow();
  });
});
