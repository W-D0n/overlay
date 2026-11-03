import { describe, expect, test } from 'bun:test';
import { MAX_KEYS, MAX_TRACKS, TIME_LIMITS, copyKeys, pasteKeys } from './layer-timeline.js';

const key = (t, v, ease = 'easeInOut') => ({ t, v, ease });
const track = (target, ...keys) => ({ target, keys });

describe('copyKeys', () => {
  const tracks = [track('opacity', key(500, 0, 'easeOut'), key(1000, 0.5), key(2500, 1, 'hold')), track('scale', key(0, 1))];

  test('toutes les images clés d\'une piste, leurs instants comptés depuis la première', () => {
    expect(copyKeys(tracks, 'opacity')).toEqual({
      target: 'opacity',
      keys: [{ dt: 0, v: 0, ease: 'easeOut' }, { dt: 500, v: 0.5, ease: 'easeInOut' }, { dt: 2000, v: 1, ease: 'hold' }],
    });
  });

  test('seulement celles qu\'on désigne, l\'écart se compte depuis la première désignée', () => {
    expect(copyKeys(tracks, 'opacity', [1, 2])).toEqual({ target: 'opacity', keys: [{ dt: 0, v: 0.5, ease: 'easeInOut' }, { dt: 1500, v: 1, ease: 'hold' }] });
    expect(copyKeys(tracks, 'opacity', [1])?.keys).toEqual([{ dt: 0, v: 0.5, ease: 'easeInOut' }]);
  });

  test('rien à copier : piste absente, rangs qui ne désignent rien', () => {
    expect(copyKeys(tracks, 'rotation')).toBeNull();
    expect(copyKeys(tracks, 'opacity', [])).toBeNull();
    expect(copyKeys(tracks, 'opacity', [9])).toBeNull();
    expect(copyKeys([], 'opacity')).toBeNull();
  });

  test('la copie ne dépend pas des pistes : elles ne sont pas modifiées', () => {
    const before = JSON.stringify(tracks);
    const clip = copyKeys(tracks, 'opacity');
    clip.keys[0].v = 99;
    expect(JSON.stringify(tracks)).toBe(before);
  });
});

describe('pasteKeys', () => {
  const clip = { target: 'opacity', keys: [{ dt: 0, v: 0, ease: 'easeOut' }, { dt: 600, v: 1, ease: 'linear' }] };

  test('sur une couche sans piste : la piste est créée, la première image à l\'instant demandé', () => {
    const result = pasteKeys([], clip, 1000);
    expect(result.tracks).toEqual([track('opacity', key(1000, 0, 'easeOut'), key(1600, 1, 'linear'))]);
    expect(result.firstIndex).toBe(0);
  });

  test('sur une piste existante : les images collées s\'insèrent dans l\'ordre, les autres restent', () => {
    const tracks = [track('opacity', key(0, 0.2), key(3000, 0.8)), track('scale', key(0, 1))];
    const result = pasteKeys(tracks, clip, 1000);
    expect(result.tracks[0].keys.map(({ t }) => t)).toEqual([0, 1000, 1600, 3000]);
    expect(result.firstIndex).toBe(1);
    expect(result.tracks[1]).toBe(tracks[1]);
  });

  test("sur une valeur qui n'a pas encore de piste, les autres pistes de la couche restent", () => {
    const tracks = [track('opacity', key(0, 0.2)), track('scale', key(0, 1))];
    const result = pasteKeys(tracks, { target: 'rotation', keys: [{ dt: 0, v: 10, ease: 'linear' }] }, 300);
    expect(result.tracks.map(({ target }) => target)).toEqual(['opacity', 'scale', 'rotation']);
    expect(result.tracks[0]).toBe(tracks[0]);
  });

  test('une image déjà posée à un instant collé est remplacée par la copie : valeur et courbe', () => {
    const tracks = [track('opacity', key(1000, 0.7, 'hold'), key(1200, 0.4))];
    const result = pasteKeys(tracks, clip, 1000);
    expect(result.tracks[0].keys).toEqual([key(1000, 0, 'easeOut'), key(1200, 0.4), key(1600, 1, 'linear')]);
  });

  test('les instants sont arrondis à la milliseconde et ramenés dans la durée possible', () => {
    expect(pasteKeys([], clip, 100.6).tracks[0].keys.map(({ t }) => t)).toEqual([101, 701]);
    expect(pasteKeys([], clip, -50).tracks[0].keys.map(({ t }) => t)).toEqual([0, 550]);
    const late = pasteKeys([], clip, TIME_LIMITS.max - 100);
    expect(late.tracks[0].keys.map(({ t }) => t)).toEqual([TIME_LIMITS.max - 100, TIME_LIMITS.max]);
  });

  test('deux images qui se rejoignent à la fin de la durée n\'en font qu\'une, la dernière', () => {
    const wide = { target: 'opacity', keys: [{ dt: 0, v: 0.1, ease: 'linear' }, { dt: 5000, v: 0.2, ease: 'easeIn' }, { dt: 9000, v: 0.9, ease: 'hold' }] };
    const result = pasteKeys([], wide, TIME_LIMITS.max - 1000);
    expect(result.tracks[0].keys).toEqual([key(TIME_LIMITS.max - 1000, 0.1, 'linear'), key(TIME_LIMITS.max, 0.9, 'hold')]);
  });

  test('les valeurs sont ramenées dans les bornes de la valeur collée, sans borne si on le demande', () => {
    const wild = { target: 'opacity', keys: [{ dt: 0, v: 5, ease: 'linear' }, { dt: 100, v: -3, ease: 'linear' }] };
    expect(pasteKeys([], wild, 0).tracks[0].keys.map(({ v }) => v)).toEqual([1, 0]);
    expect(pasteKeys([], wild, 0, { min: 0, max: 2 }).tracks[0].keys.map(({ v }) => v)).toEqual([2, 0]);
    expect(pasteKeys([], wild, 0, null).tracks[0].keys.map(({ v }) => v)).toEqual([5, -3]);
  });

  test('tout ou rien : trop d\'images clés, et la piste reste telle quelle', () => {
    const full = [track('opacity', ...Array.from({ length: MAX_KEYS }, (_, index) => key(index * 10, 0.5)))];
    expect(pasteKeys(full, clip, 5000)).toBeNull();
    // Coller sur des instants déjà occupés ne grossit pas la piste.
    const over = { target: 'opacity', keys: [{ dt: 0, v: 1, ease: 'linear' }, { dt: 10, v: 1, ease: 'linear' }] };
    expect(pasteKeys(full, over, 0).tracks[0].keys.length).toBe(MAX_KEYS);
    // Il reste exactement la place pour une image.
    const almost = [track('opacity', ...Array.from({ length: MAX_KEYS - 1 }, (_, index) => key(index * 10, 0.5)))];
    expect(pasteKeys(almost, { target: 'opacity', keys: [{ dt: 0, v: 1, ease: 'linear' }] }, 9000).tracks[0].keys.length).toBe(MAX_KEYS);
    expect(pasteKeys(almost, clip, 9000)).toBeNull();
  });

  test('tout ou rien : plus de place pour une piste de plus', () => {
    const targets = ['opacity', 'rotation', 'blur', 'scale', 'x', 'y'];
    const tracks = targets.slice(0, MAX_TRACKS).map((target) => track(target, key(0, 0)));
    expect(pasteKeys(tracks, { target: 'param:taille', keys: [{ dt: 0, v: 1, ease: 'linear' }] }, 0, null)).toBeNull();
    expect(pasteKeys(tracks, clip, 500).tracks.length).toBe(MAX_TRACKS);
  });

  test('le rang de la première image collée est celui qu\'elle prend dans la piste', () => {
    const tracks = [track('opacity', key(0, 0), key(100, 0.1), key(5000, 1))];
    expect(pasteKeys(tracks, clip, 2000).firstIndex).toBe(2);
    expect(pasteKeys(tracks, clip, 100).firstIndex).toBe(1);
  });

  test('les pistes reçues ne sont pas modifiées', () => {
    const tracks = [track('opacity', key(0, 0.2), key(3000, 0.8))];
    const before = JSON.stringify(tracks);
    pasteKeys(tracks, clip, 1000);
    expect(JSON.stringify(tracks)).toBe(before);
  });

  test('copier puis coller au même instant redonne la même piste', () => {
    const tracks = [track('opacity', key(500, 0, 'easeOut'), key(1000, 0.5), key(2500, 1, 'hold'))];
    const clipped = copyKeys(tracks, 'opacity');
    expect(pasteKeys(tracks, clipped, 500).tracks).toEqual(tracks);
  });
});
