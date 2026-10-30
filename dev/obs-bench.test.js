import { describe, expect, test } from 'bun:test';
import { BUDGET_MS, SCENARIOS, compareToBaseline, formatSummary, summarizeFrames } from './obs-bench.js';

const steady = (ms, count = 300) => Array.from({ length: count }, () => ms);

describe('summarizeFrames', () => {
  test('une série régulière à 60 i/s', () => {
    const summary = summarizeFrames(steady(BUDGET_MS));
    expect(summary.fps).toBeCloseTo(60, 5);
    expect(summary.meanMs).toBeCloseTo(BUDGET_MS, 5);
    expect(summary.p95Ms).toBeCloseTo(BUDGET_MS, 5);
    expect(summary.overBudget).toBe(0);
  });

  test('les images en retard et la pire image sont comptées, pas moyennées', () => {
    const deltas = [...steady(BUDGET_MS, 95), ...steady(60, 5)];
    const summary = summarizeFrames(deltas);
    expect(summary.overBudget).toBe(5);
    expect(summary.share).toBeCloseTo(0.05);
    expect(summary.worstMs).toBe(60);
    expect(summary.p95Ms).toBeCloseTo(BUDGET_MS, 5);
    expect(summary.meanMs).toBeGreaterThan(BUDGET_MS);
  });

  test('les valeurs absurdes sont ignorées, une série vide ne plante pas', () => {
    expect(summarizeFrames([Number.NaN, -3, 0, 16.7]).frames).toBe(1);
    expect(summarizeFrames([])).toMatchObject({ frames: 0, fps: 0, share: 0 });
  });
});

describe('compareToBaseline', () => {
  const base = summarizeFrames(steady(BUDGET_MS));

  test('aucune différence : ok', () => {
    expect(compareToBaseline(base, summarizeFrames(steady(BUDGET_MS + 0.2))).verdict).toBe('ok');
  });

  test('une perte modérée est à surveiller, une chute sous 45 i/s ou beaucoup d’images en retard est trop coûteuse', () => {
    expect(compareToBaseline(base, summarizeFrames(steady(BUDGET_MS + 2.5))).verdict).toBe('watch');
    expect(compareToBaseline(base, summarizeFrames(steady(30))).verdict).toBe('too-costly');
    const stutter = [...steady(BUDGET_MS, 70), ...steady(80, 30)];
    expect(compareToBaseline(base, summarizeFrames(stutter)).verdict).toBe('too-costly');
  });

  test('aucune image mesurée est un échec, jamais un « ok »', () => {
    expect(compareToBaseline(base, summarizeFrames([])).verdict).toBe('too-costly');
  });

  test('l’écart est donné en ms et en i/s', () => {
    const result = compareToBaseline(base, summarizeFrames(steady(BUDGET_MS + 5)));
    expect(result.deltaMs).toBeCloseTo(5, 5);
    expect(result.deltaFps).toBeLessThan(0);
  });
});

describe('scénarios', () => {
  test('la base d’abord, des identifiants uniques, chaque extension candidate de 6d présente', () => {
    expect(SCENARIOS[0].id).toBe('base');
    expect(new Set(SCENARIOS.map(({ id }) => id)).size).toBe(SCENARIOS.length);
    const text = JSON.stringify(SCENARIOS.map(({ style }) => style));
    for (const feature of ['mixBlendMode', 'transform', 'clipPath', 'filter']) expect(text).toContain(feature);
  });

  test('un résumé se lit d’un coup d’œil', () => {
    expect(formatSummary(summarizeFrames(steady(BUDGET_MS)))).toContain('60.0 i/s');
    expect(formatSummary(summarizeFrames([]))).toBe('aucune image mesurée');
  });
});
