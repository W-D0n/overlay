import { describe, expect, test } from 'bun:test';
import {
  advanceGridPhase,
  computeGridOverscan,
  gridBoundsCoverViewport,
  gridLineOpacity,
  gridPlaneOffsets,
  perspectiveGridBounds,
  perspectiveGridRow,
} from './MatrixGridBackground.js';

describe('projection continue de MatrixGrid', () => {
  test('perspectiveGridRow garde les bornes et courbe la profondeur', () => {
    expect(perspectiveGridRow(0, 540, 1.6)).toBe(0);
    expect(perspectiveGridRow(1, 540, 1.6)).toBe(540);
    expect(perspectiveGridRow(0.5, 540, 1.6)).toBeLessThan(270);
  });

  test("gridLineOpacity ne fond qu'à l'horizon et reste visible au bord", () => {
    expect(gridLineOpacity(0, 0.15)).toBe(0);
    expect(gridLineOpacity(0.5, 0.15)).toBe(1);
    expect(gridLineOpacity(1, 0.15)).toBe(1);
  });

  test('les lignes de fuite atteignent le bord exact du plan', () => {
    expect(gridPlaneOffsets(540, 1.6, 0.15)).toEqual({
      start: perspectiveGridRow(0.15, 540, 1.6),
      end: 540,
    });
  });

  test('les traverses suivent le trapèze de perspective au lieu de couvrir tout le viewport', () => {
    expect(perspectiveGridBounds(0, 1920, 0.5)).toEqual({ left: 960, right: 960 });
    const middle = perspectiveGridBounds(0.5, 1920, 0.5);
    expect(middle.left).toBeGreaterThan(0);
    expect(middle.right).toBeLessThan(1920);
    expect(middle.right - middle.left).toBeCloseTo(960);
    expect(perspectiveGridBounds(1, 1920, 0.5)).toEqual({ left: 0, right: 1920 });
  });

  test('le plan déborde assez pour couvrir les côtés avec un point de fuite décentré', () => {
    for (const vanishingX of [0.05, 0.2, 0.5, 0.8, 0.95]) {
      const overscan = computeGridOverscan(1920, vanishingX, 100, 0.1);
      const bounds = perspectiveGridBounds(0.1, 1920, vanishingX, overscan);
      expect(bounds.left).toBeLessThanOrEqual(-100);
      expect(bounds.right).toBeGreaterThanOrEqual(2020);
    }
  });

  test('une traverse reste masquée tant que ses extrémités seraient visibles dans le viewport', () => {
    expect(gridBoundsCoverViewport({ left: 120, right: 1800 }, 1920)).toBe(false);
    expect(gridBoundsCoverViewport({ left: -1, right: 1921 }, 1920)).toBe(true);
  });

  test('advanceGridPhase est indépendant du framerate et boucle sans saut hors domaine', () => {
    const at60 = Array.from({ length: 60 }).reduce(
      (phase) => advanceGridPhase(phase, 1, 1 / 60),
      0,
    );
    const at30 = Array.from({ length: 30 }).reduce(
      (phase) => advanceGridPhase(phase, 1, 1 / 30),
      0,
    );
    expect(at60).toBeCloseTo(at30, 8);
    expect(advanceGridPhase(0.99, 1, 0.1)).toBeGreaterThanOrEqual(0);
    expect(advanceGridPhase(0.99, 1, 0.1)).toBeLessThan(1);
  });
});
