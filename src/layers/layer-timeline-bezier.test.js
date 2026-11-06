import { describe, expect, test } from 'bun:test';
import { ANIMATION_EASES } from './layer-animation.js';
import { DEFAULT_BEZIER, cubicBezier } from './cubic-bezier.js';
import { EASES, canonicalTracks, changeKey, copyKeys, easeValue, evaluateTimeline, pasteKeys, sampleKeys, setKey, trackErrors } from './layer-timeline.js';
import { canonicalSceneDoc, createLayer, validateSceneDoc } from '../scene/scene-doc.js';

const key = (t, v, ease = 'easeInOut', extra = {}) => ({ t, v, ease, ...extra });
const track = (target, ...keys) => ({ target, keys });
const OVERSHOOT = [0.34, 1.56, 0.64, 1];

describe('la courbe personnalisée dans une image clé', () => {
  test('« Courbe personnalisée » fait partie des courbes de la timeline, pas de celles des animations de couche', () => {
    expect(EASES.some(({ id, label }) => id === 'bezier' && label === 'Courbe personnalisée')).toBe(true);
    expect(ANIMATION_EASES.some(({ id }) => id === 'bezier')).toBe(false);
    expect(ANIMATION_EASES.some(({ id }) => id === 'hold')).toBe(false);
  });

  test('easeValue lit la courbe donnée, à défaut la courbe de départ', () => {
    expect(easeValue('bezier', 0.3, OVERSHOOT)).toBe(cubicBezier(OVERSHOOT, 0.3));
    expect(easeValue('bezier', 0.3)).toBe(cubicBezier(DEFAULT_BEZIER, 0.3));
    expect(easeValue('bezier', 0.3, /** @type {*} */ ('x'))).toBe(cubicBezier(DEFAULT_BEZIER, 0.3));
    expect(easeValue('linear', 0.3, OVERSHOOT)).toBe(0.3);
  });

  test('l\'interpolation entre deux images clés suit la courbe de la première, et peut dépasser la seconde', () => {
    const keys = [key(0, 0, 'bezier', { bezier: OVERSHOOT }), key(1000, 1)];
    expect(sampleKeys(keys, 0)).toBe(0);
    expect(sampleKeys(keys, 1000)).toBe(1);
    expect(sampleKeys(keys, 500)).toBeCloseTo(cubicBezier(OVERSHOOT, 0.5), 9);
    expect(Math.max(...Array.from({ length: 100 }, (_, at) => sampleKeys(keys, at * 10)))).toBeGreaterThan(1.05);
    expect(evaluateTimeline([track('scale', ...keys)], 500).scale).toBeCloseTo(cubicBezier(OVERSHOOT, 0.5), 9);
  });

  test('la courbe de la dernière image clé ne sert à rien : la valeur reste la sienne', () => {
    expect(sampleKeys([key(0, 0), key(1000, 1, 'bezier', { bezier: OVERSHOOT })], 5000)).toBe(1);
  });
});

describe('validation et forme canonique', () => {
  const errors = (keys) => trackErrors('t', [track('scale', ...keys)]);

  test('une courbe personnalisée exige sa courbe, valide', () => {
    expect(errors([key(0, 1, 'bezier', { bezier: OVERSHOOT })])).toEqual([]);
    expect(errors([key(0, 1, 'bezier')])[0]).toContain('t[0].keys[0].bezier : quatre nombres attendus');
    expect(errors([key(0, 1, 'bezier', { bezier: [0, 0, 1] })])[0]).toContain('quatre nombres attendus');
    expect(errors([key(0, 1, 'bezier', { bezier: [2, 0, 1, 1] })])[0]).toContain('t[0].keys[0].bezier[0]');
  });

  test('les autres courbes n\'ont pas de courbe personnalisée', () => {
    expect(errors([key(0, 1, 'linear', { bezier: OVERSHOOT })])).toEqual(['t[0].keys[0].bezier : réservé à la courbe personnalisée']);
    expect(errors([key(0, 1, 'hold')])).toEqual([]);
  });

  test('la forme canonique arrondit et borne la courbe, et retire celle d\'une autre courbe', () => {
    const canonical = canonicalTracks([track('scale', key(0, 1, 'bezier', { bezier: [-1, 9, 0.12345, 0.5006] }), key(500, 1, 'linear', { bezier: OVERSHOOT }))]);
    expect(canonical[0].keys[0].bezier).toEqual([0, 3, 0.123, 0.501]);
    expect('bezier' in canonical[0].keys[1]).toBe(false);
    expect(trackErrors('t', canonical)).toEqual([]);
  });

  test('une courbe qui n\'en est pas une reste telle quelle, la validation la refuse', () => {
    const canonical = canonicalTracks([track('scale', key(0, 1, 'bezier', { bezier: 'x' }))]);
    expect(canonical[0].keys[0].bezier).toBe('x');
    expect(trackErrors('t', canonical).length).toBe(1);
  });

  test('dans le document de scène : refusée avec son chemin, normalisée sinon', () => {
    const scene = (keys) => ({ version: 1, id: 's', name: 'S', layers: [createLayer({ id: 'a', kind: 'text', options: {}, timeline: [track('scale', ...keys)] })] });
    expect(validateSceneDoc(scene([key(0, 1, 'bezier', { bezier: OVERSHOOT })])).ok).toBe(true);
    const refused = validateSceneDoc(scene([key(0, 1, 'bezier', { bezier: [9, 9, 9, 9] })]));
    expect(refused.ok).toBe(false);
    expect(refused.errors[0]).toContain('layers[a].timeline[0].keys[0].bezier');
    expect(canonicalSceneDoc(scene([key(0, 1, 'bezier', { bezier: [0.1234, 0.5, 0.5, 0.5] })])).layers[0].timeline[0].keys[0].bezier).toEqual([0.123, 0.5, 0.5, 0.5]);
  });
});

describe('édition', () => {
  const tracks = [track('scale', key(0, 1, 'easeOut'), key(1000, 2))];

  test('choisir « personnalisée » donne la courbe de départ ; régler la courbe choisit « personnalisée »', () => {
    const chosen = changeKey(tracks, 'scale', 0, { ease: 'bezier' }, null);
    expect(chosen.tracks[0].keys[0]).toEqual({ t: 0, v: 1, ease: 'bezier', bezier: [...DEFAULT_BEZIER] });
    const tuned = changeKey(tracks, 'scale', 0, { bezier: OVERSHOOT }, null);
    expect(tuned.tracks[0].keys[0]).toEqual({ t: 0, v: 1, ease: 'bezier', bezier: OVERSHOOT });
  });

  test('la courbe réglée est bornée et arrondie', () => {
    const tuned = changeKey(tracks, 'scale', 0, { bezier: [-1, 9, 0.12345, 0.5] }, null);
    expect(tuned.tracks[0].keys[0].bezier).toEqual([0, 3, 0.123, 0.5]);
  });

  test('déplacer ou régler la valeur d\'une image clé personnalisée garde sa courbe', () => {
    const custom = [track('scale', key(0, 1, 'bezier', { bezier: OVERSHOOT }), key(1000, 2))];
    expect(changeKey(custom, 'scale', 0, { t: 300 }, null).tracks[0].keys[0].bezier).toEqual(OVERSHOOT);
    expect(changeKey(custom, 'scale', 0, { v: 1.5 }, null).tracks[0].keys[0].bezier).toEqual(OVERSHOOT);
  });

  test('choisir une autre courbe efface la personnalisée', () => {
    const custom = [track('scale', key(0, 1, 'bezier', { bezier: OVERSHOOT }), key(1000, 2))];
    const linear = changeKey(custom, 'scale', 0, { ease: 'linear' }, null);
    expect(linear.tracks[0].keys[0]).toEqual({ t: 0, v: 1, ease: 'linear' });
    expect(trackErrors('t', linear.tracks)).toEqual([]);
  });

  test('l\'image clé suit son rang quand son instant change, courbe comprise', () => {
    const custom = [track('scale', key(0, 1, 'bezier', { bezier: OVERSHOOT }), key(1000, 2), key(2000, 3))];
    const moved = changeKey(custom, 'scale', 0, { t: 1500 }, null);
    expect(moved.index).toBe(1);
    expect(moved.tracks[0].keys[1].bezier).toEqual(OVERSHOOT);
  });

  test('poser une image sur un instant déjà occupé garde la courbe de l\'image remplacée', () => {
    const custom = [track('scale', key(0, 1, 'bezier', { bezier: OVERSHOOT }), key(1000, 2))];
    const replaced = setKey(custom, 'scale', 0, 1.5, 'linear', null);
    expect(replaced[0].keys[0]).toEqual({ t: 0, v: 1.5, ease: 'bezier', bezier: OVERSHOOT });
  });

  test('copier puis coller emporte la courbe, sans la partager', () => {
    const custom = [track('scale', key(0, 1, 'bezier', { bezier: OVERSHOOT }), key(1000, 2, 'linear'))];
    const clip = copyKeys(custom, 'scale');
    expect(clip.keys[0].bezier).toEqual(OVERSHOOT);
    expect('bezier' in clip.keys[1]).toBe(false);
    clip.keys[0].bezier[0] = 0;
    expect(custom[0].keys[0].bezier).toEqual(OVERSHOOT);
    const again = copyKeys(custom, 'scale');
    const pasted = pasteKeys([], again, 2000, null);
    expect(pasted.tracks[0].keys[0]).toEqual({ t: 2000, v: 1, ease: 'bezier', bezier: OVERSHOOT });
    expect(pasted.tracks[0].keys[0].bezier).not.toBe(again.keys[0].bezier);
    // Coller deux fois la même copie ne lie pas les deux images : régler l'une ne bouge pas l'autre.
    const twice = pasteKeys(pasted.tracks, again, 5000, null);
    twice.tracks[0].keys[0].bezier[0] = 0;
    expect(twice.tracks[0].keys[2].bezier).toEqual(OVERSHOOT);
    expect(trackErrors('t', pasted.tracks)).toEqual([]);
  });
});
