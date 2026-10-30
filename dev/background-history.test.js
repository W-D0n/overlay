import { describe, expect, test } from 'bun:test';
import { HISTORY_LIMIT, findEntry, recordReplaced, sameScene, validateHistory } from './background-history.js';

const scene = (kind, options = {}, extra = {}) => ({
  version: 1,
  id: 'current',
  name: 'En antenne',
  layers: [{ id: 'main', kind, visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options }],
  ...extra,
});
const RAIN = scene('rain', { speed: 1 });
const DOTS = scene('dotgrid');

describe('sameScene', () => {
  test('l’ordre des clés ne compte pas, le contenu oui', () => {
    expect(sameScene(scene('rain', { a: 1, b: 2 }), scene('rain', { b: 2, a: 1 }))).toBe(true);
    expect(sameScene(RAIN, scene('rain', { speed: 2 }))).toBe(false);
    expect(sameScene(RAIN, scene('rain', { speed: 1 }, { transition: { type: 'fade', durationMs: 500 } }))).toBe(false);
  });

  test('une clé indéfinie équivaut à une clé absente', () => {
    expect(sameScene(RAIN, { ...RAIN, tags: undefined })).toBe(true);
  });

  test('l’identité de la scène ne compte pas, une couche en plus ou déplacée oui', () => {
    expect(sameScene(RAIN, { ...RAIN, id: 'nuit', name: 'Nuit' })).toBe(true);
    const moved = { ...RAIN, layers: [{ ...RAIN.layers[0], placement: { x: 0.5, y: 0, width: 0.5, height: 1 } }] };
    expect(sameScene(RAIN, moved)).toBe(false);
    expect(sameScene(RAIN, { ...RAIN, layers: [...RAIN.layers, { ...RAIN.layers[0], id: 'second' }] })).toBe(false);
  });
});

describe('recordReplaced', () => {
  test('range l’état remplacé en tête, le plus récent d’abord', () => {
    const first = recordReplaced({ history: [], replaced: RAIN, next: DOTS, at: '2026-10-30T10:00:00.000Z' });
    const second = recordReplaced({ history: first, replaced: DOTS, next: RAIN, at: '2026-10-30T11:00:00.000Z' });
    expect(second.map((entry) => entry.scene.layers[0].kind)).toEqual(['dotgrid', 'rain']);
    expect(second[0].at).toBe('2026-10-30T11:00:00.000Z');
  });

  test('une publication identique ne laisse aucune trace', () => {
    expect(recordReplaced({ history: [], replaced: RAIN, next: { ...RAIN }, at: '2026-10-30T10:00:00.000Z' })).toEqual([]);
  });

  test('borné : les plus anciens sortent', () => {
    let history = [];
    for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) {
      history = recordReplaced({ history, replaced: scene('rain', { n: index }), next: DOTS, at: new Date(index * 1000).toISOString() });
    }
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history[0].scene.layers[0].options.n).toBe(HISTORY_LIMIT + 4);
    expect(history.at(-1).scene.layers[0].options.n).toBe(5);
  });

  test('deux remplacements dans la même milliseconde gardent des instants distincts', () => {
    const at = '2026-10-30T10:00:00.000Z';
    const one = recordReplaced({ history: [], replaced: RAIN, next: DOTS, at });
    const two = recordReplaced({ history: one, replaced: DOTS, next: RAIN, at });
    expect(two.map((entry) => entry.at)).toEqual(['2026-10-30T10:00:00.001Z', at]);
  });

  test('ne modifie pas l’historique reçu', () => {
    const history = Object.freeze([]);
    expect(() => recordReplaced({ history, replaced: RAIN, next: DOTS, at: '2026-10-30T10:00:00.000Z' })).not.toThrow();
  });
});

describe('findEntry', () => {
  test('retrouve par instant exact, sinon null', () => {
    const history = recordReplaced({ history: [], replaced: RAIN, next: DOTS, at: '2026-10-30T10:00:00.000Z' });
    expect(findEntry(history, '2026-10-30T10:00:00.000Z')?.scene).toEqual(RAIN);
    expect(findEntry(history, '2026-10-30T10:00:00.001Z')).toBeNull();
  });
});

describe('validateHistory', () => {
  const ok = () => [];
  test('absent : valide', () => expect(validateHistory(undefined, ok)).toEqual([]));

  test('refuse la forme, la date, le doublon, le dépassement et l’état invalide', () => {
    expect(validateHistory({}, ok)).toEqual(['history : tableau attendu']);
    expect(validateHistory([null], ok)[0]).toContain('objet attendu');
    expect(validateHistory([{ at: 'hier', scene: RAIN }], ok)[0]).toContain('date ISO');
    const at = '2026-10-30T10:00:00.000Z';
    expect(validateHistory([{ at, scene: RAIN }, { at, scene: DOTS }], ok)[0]).toContain('en double');
    const tooMany = Array.from({ length: HISTORY_LIMIT + 1 }, (_, index) => ({ at: new Date(index).toISOString(), scene: RAIN }));
    expect(validateHistory(tooMany, ok)[0]).toContain('au plus');
    expect(validateHistory([{ at, scene: RAIN }], () => ['effet inconnu'])[0]).toBe('history[0].scene : effet inconnu');
  });
});
