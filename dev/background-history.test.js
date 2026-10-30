import { describe, expect, test } from 'bun:test';
import { HISTORY_LIMIT, findEntry, recordReplaced, sameCurrent, validateHistory } from './background-history.js';

const RAIN = { component: 'rain', options: { speed: 1 } };
const DOTS = { component: 'dotgrid', options: {} };

describe('sameCurrent', () => {
  test('l’ordre des clés ne compte pas, le contenu oui', () => {
    expect(sameCurrent({ component: 'rain', options: { a: 1, b: 2 } }, { options: { b: 2, a: 1 }, component: 'rain' })).toBe(true);
    expect(sameCurrent(RAIN, { component: 'rain', options: { speed: 2 } })).toBe(false);
    expect(sameCurrent(RAIN, { ...RAIN, transition: { type: 'fade', durationMs: 500 } })).toBe(false);
  });

  test('une clé indéfinie équivaut à une clé absente', () => {
    expect(sameCurrent(RAIN, { ...RAIN, showBranding: undefined })).toBe(true);
  });
});

describe('recordReplaced', () => {
  test('range l’état remplacé en tête, le plus récent d’abord', () => {
    const first = recordReplaced({ history: [], replaced: RAIN, next: DOTS, at: '2026-10-30T10:00:00.000Z' });
    const second = recordReplaced({ history: first, replaced: DOTS, next: RAIN, at: '2026-10-30T11:00:00.000Z' });
    expect(second.map((entry) => entry.current.component)).toEqual(['dotgrid', 'rain']);
    expect(second[0].at).toBe('2026-10-30T11:00:00.000Z');
  });

  test('une publication identique ne laisse aucune trace', () => {
    expect(recordReplaced({ history: [], replaced: RAIN, next: { ...RAIN }, at: '2026-10-30T10:00:00.000Z' })).toEqual([]);
  });

  test('borné : les plus anciens sortent', () => {
    let history = [];
    for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) {
      history = recordReplaced({ history, replaced: { component: 'rain', options: { n: index } }, next: DOTS, at: new Date(index * 1000).toISOString() });
    }
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history[0].current.options.n).toBe(HISTORY_LIMIT + 4);
    expect(history.at(-1).current.options.n).toBe(5);
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
    expect(findEntry(history, '2026-10-30T10:00:00.000Z')?.current).toEqual(RAIN);
    expect(findEntry(history, '2026-10-30T10:00:00.001Z')).toBeNull();
  });
});

describe('validateHistory', () => {
  const ok = () => [];
  test('absent : valide', () => expect(validateHistory(undefined, ok)).toEqual([]));

  test('refuse la forme, la date, le doublon, le dépassement et l’état invalide', () => {
    expect(validateHistory({}, ok)).toEqual(['history : tableau attendu']);
    expect(validateHistory([null], ok)[0]).toContain('objet attendu');
    expect(validateHistory([{ at: 'hier', current: RAIN }], ok)[0]).toContain('date ISO');
    const at = '2026-10-30T10:00:00.000Z';
    expect(validateHistory([{ at, current: RAIN }, { at, current: DOTS }], ok)[0]).toContain('en double');
    const tooMany = Array.from({ length: HISTORY_LIMIT + 1 }, (_, index) => ({ at: new Date(index).toISOString(), current: RAIN }));
    expect(validateHistory(tooMany, ok)[0]).toContain('au plus');
    expect(validateHistory([{ at, current: RAIN }], () => ['effet inconnu'])[0]).toBe('history[0].current : effet inconnu');
  });
});
