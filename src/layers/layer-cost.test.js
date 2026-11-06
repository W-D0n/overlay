import { describe, expect, test } from 'bun:test';
import { FRAME_BUDGET_MS, costLevel, formatCost, smooth, sumCosts } from './layer-cost.js';

describe('smooth', () => {
  test('le premier échantillon démarre la moyenne, les suivants la déplacent doucement', () => {
    expect(smooth(null, 4)).toBe(4);
    expect(smooth(4, 14, 0.1)).toBeCloseTo(5);
  });

  test('converge vers une valeur stable', () => {
    let value = null;
    for (let i = 0; i < 200; i += 1) value = smooth(value, 2);
    expect(value).toBeCloseTo(2, 5);
    for (let i = 0; i < 200; i += 1) value = smooth(value, 8);
    expect(value).toBeCloseTo(8, 3);
  });

  test('un échantillon absurde (NaN, négatif) ne pollue pas la moyenne', () => {
    expect(smooth(3, Number.NaN)).toBe(3);
    expect(smooth(3, -1)).toBe(3);
    expect(smooth(null, Number.NaN)).toBe(0);
  });
});

describe('costLevel et formatCost', () => {
  test('niveaux par part du budget d’une image', () => {
    expect(costLevel(0.2)).toBe('ok');
    expect(costLevel(FRAME_BUDGET_MS * 0.1)).toBe('warn');
    expect(costLevel(FRAME_BUDGET_MS * 0.3)).toBe('high');
  });

  test('affichage lisible', () => {
    expect(formatCost(0.01)).toBe('< 0,1 ms');
    expect(formatCost(0.46)).toBe('0,5 ms');
    expect(formatCost(3.14)).toBe('3,1 ms');
    expect(formatCost(12.4)).toBe('12 ms');
  });
});

describe('sumCosts', () => {
  test('ignore les couches non mesurées, donne la part du budget et le niveau', () => {
    const result = sumCosts([1, null, 2]);
    expect(result.total).toBe(3);
    expect(result.measured).toBe(2);
    expect(result.share).toBeCloseTo(3 / FRAME_BUDGET_MS);
    expect(result.level).toBe('ok');
    expect(sumCosts([FRAME_BUDGET_MS * 0.7]).level).toBe('high');
    expect(sumCosts([FRAME_BUDGET_MS * 0.35]).level).toBe('warn');
    expect(sumCosts([])).toMatchObject({ total: 0, measured: 0, level: 'ok' });
  });
});
