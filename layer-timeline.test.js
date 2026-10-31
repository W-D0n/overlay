import { describe, expect, test } from 'bun:test';
import {
  DURATION_BOUNDS, MAX_KEYS, MAX_TRACKS, canonicalSceneTimeline, canonicalTracks, changeKey, easeValue, effectiveTimeline, evaluateTimeline, hasKeys, playbackTime,
  removeKey, removeTrack, sampleKeys, sceneTimelineErrors, setKey, trackErrors,
} from './layer-timeline.js';
import { canonicalSceneDoc, createLayer, currentFromScene, validateSceneDoc, withoutLook } from './scene-doc.js';

const key = (t, v, ease = 'linear') => ({ t, v, ease });
const track = (target, ...keys) => ({ target, keys });

describe('courbes', () => {
  test('chaque courbe va de 0 à 1 ; le palier reste à 0 jusqu’à la clé suivante', () => {
    for (const ease of ['linear', 'easeIn', 'easeOut', 'easeInOut']) {
      expect(easeValue(ease, 0)).toBe(0);
      expect(easeValue(ease, 1)).toBeCloseTo(1, 10);
    }
    expect(easeValue('hold', 0.99)).toBe(0);
    expect(easeValue('easeIn', 0.5)).toBe(0.25);
    expect(easeValue('easeOut', 0.5)).toBe(0.75);
    expect(easeValue('easeInOut', 0.5)).toBe(0.5);
    expect(easeValue('easeIn', 0.3)).toBeLessThan(0.3);
    expect(easeValue('easeOut', 0.3)).toBeGreaterThan(0.3);
  });
});

describe('sampleKeys', () => {
  const keys = [key(1000, 0), key(2000, 10), key(4000, 4)];

  test('avant la première clé, sa valeur ; après la dernière, la sienne ; sur une clé, la sienne', () => {
    expect(sampleKeys(keys, 0)).toBe(0);
    expect(sampleKeys(keys, 1000)).toBe(0);
    expect(sampleKeys(keys, 2000)).toBe(10);
    expect(sampleKeys(keys, 9999)).toBe(4);
  });

  test('entre deux clés, interpolation par la courbe de la clé de départ', () => {
    expect(sampleKeys(keys, 1500)).toBe(5);
    expect(sampleKeys(keys, 3000)).toBe(7);
    expect(sampleKeys([key(0, 0, 'easeIn'), key(1000, 10)], 500)).toBe(2.5);
    expect(sampleKeys([key(0, 0, 'hold'), key(1000, 10)], 999)).toBe(0);
    expect(sampleKeys([key(0, 0, 'hold'), key(1000, 10)], 1000)).toBe(10);
  });

  test('une piste sans clé n’a pas de valeur ; une seule clé donne sa valeur partout', () => {
    expect(sampleKeys([], 100)).toBeNull();
    expect(sampleKeys([key(500, 3)], 0)).toBe(3);
    expect(sampleKeys([key(500, 3)], 5000)).toBe(3);
  });
});

describe('playbackTime et timeline de scène', () => {
  test('une seule fois : le temps s’arrête à la durée ; en boucle : il revient au début', () => {
    const once = { durationMs: 2000, loop: 'once' };
    const loop = { durationMs: 2000, loop: 'loop' };
    expect(playbackTime(500, once)).toBe(500);
    expect(playbackTime(9000, once)).toBe(2000);
    expect(playbackTime(2500, loop)).toBe(500);
    expect(playbackTime(4000, loop)).toBe(0);
    expect(playbackTime(-5, once)).toBe(0);
  });

  test('la timeline effective : la sienne, ou celle par défaut qui couvre la dernière clé', () => {
    const own = { durationMs: 1500, loop: 'loop' };
    expect(effectiveTimeline(own, [])).toBe(own);
    expect(effectiveTimeline(undefined, [])).toEqual({ durationMs: 4000, loop: 'once' });
    expect(effectiveTimeline(undefined, [{ timeline: [track('opacity', key(0, 0), key(9000, 1))] }])).toEqual({ durationMs: 9000, loop: 'once' });
    expect(effectiveTimeline(undefined, [{ timeline: [track('opacity', key(0, 0), key(90_000, 1))] }]).durationMs).toBe(DURATION_BOUNDS.max);
  });

  test('evaluateTimeline : une valeur par piste', () => {
    const values = evaluateTimeline([track('opacity', key(0, 0), key(1000, 1)), track('rotation', key(0, 0), key(1000, 90))], 500);
    expect(values).toEqual({ opacity: 0.5, rotation: 45 });
  });

  test('hasKeys', () => {
    expect(hasKeys([track('opacity', key(0, 0))])).toBe(true);
    expect(hasKeys([track('opacity')])).toBe(false);
    expect(hasKeys(undefined)).toBe(false);
  });
});

describe('validation', () => {
  test('une piste valide, ou absente, n’a aucun défaut', () => {
    expect(trackErrors('t', undefined)).toEqual([]);
    expect(trackErrors('t', [track('opacity', key(0, 0), key(1000, 1)), track('scale', key(0, 1))])).toEqual([]);
  });

  test('refuse trop de pistes ou de clés, une cible inconnue ou en double, des clés qui ne se suivent pas, des valeurs qui ne sont pas des nombres', () => {
    expect(trackErrors('t', 'non')[0]).toContain('liste attendue');
    expect(trackErrors('t', new Array(MAX_TRACKS + 1).fill(track('opacity')))[0]).toContain('au plus');
    expect(trackErrors('t', [track('couleur', key(0, 0))])[0]).toContain('inconnue');
    expect(trackErrors('t', [track('opacity', key(0, 0)), track('opacity', key(0, 1))])[0]).toContain('déjà une piste');
    expect(trackErrors('t', [track('opacity', ...Array.from({ length: MAX_KEYS + 1 }, (_, index) => key(index * 10, 0)))])[0]).toContain('images clés au plus');
    expect(trackErrors('t', [track('opacity', key(500, 0), key(500, 1))])[0]).toContain('sans doublon');
    expect(trackErrors('t', [track('opacity', key(500, 0), key(100, 1))])[0]).toContain('sans doublon');
    expect(trackErrors('t', [track('opacity', { t: 'x', v: 0, ease: 'linear' })])[0]).toContain('.t');
    expect(trackErrors('t', [track('opacity', { t: 0, v: null, ease: 'linear' })])[0]).toContain('.v');
    expect(trackErrors('t', [track('opacity', { t: 0, v: 0, ease: 'rebond' })])[0]).toContain('courbe');
    expect(trackErrors('t', [track('opacity')]).length).toBe(0);
  });

  test('la timeline d’une scène : durée en nombre, mode connu', () => {
    expect(sceneTimelineErrors('timeline', undefined)).toEqual([]);
    expect(sceneTimelineErrors('timeline', { durationMs: 3000, loop: 'loop' })).toEqual([]);
    expect(sceneTimelineErrors('timeline', { durationMs: '3', loop: 'loop' })[0]).toContain('durationMs');
    expect(sceneTimelineErrors('timeline', { durationMs: 3000, loop: 'aller-retour' })[0]).toContain('loop');
    expect(sceneTimelineErrors('timeline', [])[0]).toContain('objet attendu');
  });
});

describe('forme canonique', () => {
  test('temps bornés et arrondis, valeurs bornées par leur cible, clés triées, piste vide retirée', () => {
    const canonical = canonicalTracks([track('opacity', key(2000.6, 5), key(-40, -3)), track('rotation')]);
    expect(canonical).toEqual([track('opacity', key(0, 0), key(2001, 1))]);
    expect(canonicalTracks([track('opacity')])).toBeUndefined();
    expect(canonicalTracks([])).toBeUndefined();
    expect(canonicalTracks('x')).toBe('x');
  });

  test('durée de scène bornée', () => {
    expect(canonicalSceneTimeline({ durationMs: 10, loop: 'once' }).durationMs).toBe(DURATION_BOUNDS.min);
    expect(canonicalSceneTimeline({ durationMs: 999_999, loop: 'once' }).durationMs).toBe(DURATION_BOUNDS.max);
  });
});

describe('édition des pistes', () => {
  test('setKey crée la piste et la clé, garde les clés triées, remplace une clé au même temps en gardant sa courbe', () => {
    let tracks = setKey([], 'opacity', 1000, 1, 'linear');
    tracks = setKey(tracks, 'opacity', 0, 0, 'easeOut');
    expect(tracks[0].keys.map((k) => k.t)).toEqual([0, 1000]);
    tracks = setKey(tracks, 'opacity', 1000, 0.5, 'hold');
    expect(tracks[0].keys[1]).toEqual({ t: 1000, v: 0.5, ease: 'linear' });
    expect(tracks[0].keys.length).toBe(2);
  });

  test('setKey borne le temps et la valeur ; refuse au-delà des limites', () => {
    expect(setKey([], 'opacity', -10, 9)[0].keys[0]).toMatchObject({ t: 0, v: 1 });
    let full = [];
    for (let index = 0; index < MAX_KEYS; index += 1) full = setKey(full, 'blur', index * 100, 1);
    expect(setKey(full, 'blur', 99_999, 1)).toBeNull();
    expect(setKey(full, 'blur', 100, 2)).not.toBeNull();
    const six = ['opacity', 'rotation', 'blur', 'scale', 'x', 'y'].reduce((tracks, target) => setKey(tracks, target, 0, 0), []);
    expect(six.length).toBe(MAX_TRACKS);
  });

  test('removeKey retire une clé, et la piste avec sa dernière clé', () => {
    const tracks = setKey(setKey([], 'opacity', 0, 0), 'opacity', 500, 1);
    expect(removeKey(tracks, 'opacity', 0)[0].keys.map((k) => k.t)).toEqual([500]);
    expect(removeKey(removeKey(tracks, 'opacity', 0), 'opacity', 0)).toEqual([]);
  });

  test('changeKey : temps, valeur, courbe ; il garde l’ordre, refuse de se superposer et rend la nouvelle position', () => {
    const tracks = setKey(setKey(setKey([], 'opacity', 0, 0), 'opacity', 500, 1), 'opacity', 1000, 0);
    const moved = changeKey(tracks, 'opacity', 0, { t: 700 });
    expect(moved.tracks[0].keys.map((k) => k.t)).toEqual([500, 700, 1000]);
    expect(moved.index).toBe(1);
    expect(changeKey(tracks, 'opacity', 0, { t: 500 })).toMatchObject({ tracks, refused: true });
    expect(changeKey(tracks, 'opacity', 1, { v: 7, ease: 'hold' }).tracks[0].keys[1]).toEqual({ t: 500, v: 1, ease: 'hold' });
    expect(changeKey(tracks, 'opacity', 9, { v: 1 }).tracks).toEqual(tracks);
    expect(changeKey(tracks, 'rotation', 0, { v: 1 }).tracks).toEqual(tracks);
  });

  test('removeTrack', () => {
    expect(removeTrack(setKey([], 'opacity', 0, 0), 'opacity')).toEqual([]);
  });

  test('l’édition ne modifie jamais ses entrées', () => {
    const tracks = [track('opacity', key(0, 0), key(1000, 1))];
    const copy = structuredClone(tracks);
    setKey(tracks, 'opacity', 500, 0.5);
    removeKey(tracks, 'opacity', 0);
    changeKey(tracks, 'opacity', 0, { t: 200 });
    expect(tracks).toEqual(copy);
  });
});

describe('dans le document de scène', () => {
  const layer = (timeline) => createLayer({ id: 'a', kind: 'text', timeline });
  const scene = (extra = {}, timeline = undefined) => ({ version: 1, id: 's', name: 'S', layers: [layer(timeline)], ...extra });
  const tracks = [track('opacity', key(0, 0), key(1000, 1))];

  test('une couche porte ses pistes ; la scène sa timeline ; tout reste valide', () => {
    expect(validateSceneDoc(scene({ timeline: { durationMs: 3000, loop: 'loop' } }, tracks)).ok).toBe(true);
  });

  test('des pistes ou une timeline invalides refusent la scène, avec le chemin', () => {
    expect(validateSceneDoc(scene({}, [track('couleur', key(0, 0))])).errors[0]).toContain('layers[a].timeline[0].target');
    expect(validateSceneDoc(scene({ timeline: { durationMs: 'x', loop: 'once' } })).errors[0]).toContain('timeline.durationMs');
  });

  test('forme canonique de la scène et des couches ; withoutLook retire les pistes', () => {
    const canonical = canonicalSceneDoc(scene({ timeline: { durationMs: 5, loop: 'once' } }, [track('opacity', key(500, 9), key(0, 0))]));
    expect(canonical.timeline.durationMs).toBe(DURATION_BOUNDS.min);
    expect(canonical.layers[0].timeline[0].keys).toEqual([key(0, 0), key(500, 1)]);
    expect('timeline' in withoutLook(layer(tracks))).toBe(false);
  });

  test('une scène animée n’a pas de forme historique : l’animation ne se perd jamais en silence', () => {
    expect(currentFromScene(scene({}, tracks))).toBeNull();
    expect(currentFromScene(scene({ timeline: { durationMs: 3000, loop: 'loop' } }))).toBeNull();
    expect(currentFromScene(scene())).not.toBeNull();
  });
});

describe('cas limites de sampleKeys', () => {
  test('sur une clé intérieure, c’est la valeur de cette clé, même quand la clé précédente est un palier', () => {
    const keys = [key(0, 0, 'hold'), key(1000, 10), key(2000, 0)];
    expect(sampleKeys(keys, 1000)).toBe(10);
    expect(sampleKeys(keys, 999)).toBe(0);
    expect(sampleKeys(keys, 1001)).toBeCloseTo(9.99, 2);
  });
});
