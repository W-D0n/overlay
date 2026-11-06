import { describe, expect, test } from 'bun:test';
import { MAX_SCALE, MIN_SCALE, ZOOM_STEPS, clampScale, keepInView, nextZoomStep, panView, resolveView, screenToSource, setViewScale, sourceToScreen, zoomView } from './view-transform.js';
import { STAGE_HEIGHT, STAGE_WIDTH, fitStage } from './preview-stage.js';

const AREA = { areaWidth: 1000, areaHeight: 600 };

describe('résolution de la vue', () => {
  test('ajustée : la toile remplit la zone, recentrée', () => {
    const t = resolveView(AREA, { mode: 'fit' });
    expect(t).toEqual(fitStage(AREA));
  });

  test('libre : l’échelle et la position sont celles de l’utilisateur, quelle que soit la zone', () => {
    const view = { mode: 'free', scale: 0.5, left: 10, top: 20 };
    expect(resolveView(AREA, view)).toEqual({ scale: 0.5, left: 10, top: 20 });
    expect(resolveView({ areaWidth: 2000, areaHeight: 900 }, view)).toEqual({ scale: 0.5, left: 10, top: 20 });
  });
});

describe('zoom', () => {
  const start = { scale: 0.5, left: 100, top: 50 };

  test('le point sous le pointeur reste sous le pointeur', () => {
    const anchor = { x: 400, y: 300 };
    const before = screenToSource(start, anchor);
    const view = zoomView(start, 2, anchor, AREA);
    expect(view.mode).toBe('free');
    const after = screenToSource(view, anchor);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(view.scale).toBe(1);
  });

  test('l’échelle est bornée', () => {
    expect(zoomView(start, 1000, { x: 0, y: 0 }, AREA).scale).toBe(MAX_SCALE);
    expect(zoomView(start, 0.0001, { x: 0, y: 0 }, AREA).scale).toBe(MIN_SCALE);
    expect(clampScale(-3)).toBe(MIN_SCALE);
  });

  test('fixer l’échelle garde le centre de la zone au même endroit de la toile', () => {
    const center = { x: AREA.areaWidth / 2, y: AREA.areaHeight / 2 };
    const before = screenToSource(start, center);
    const view = setViewScale(start, 1, AREA);
    const after = screenToSource(view, center);
    expect(view.scale).toBe(1);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  test('paliers : suivant et précédent, bornés aux extrémités', () => {
    expect(nextZoomStep(1, 1)).toBe(1.5);
    expect(nextZoomStep(1, -1)).toBe(0.75);
    expect(nextZoomStep(0.6, 1)).toBe(0.75);
    expect(nextZoomStep(0.6, -1)).toBe(0.5);
    expect(nextZoomStep(MAX_SCALE, 1)).toBe(MAX_SCALE);
    expect(nextZoomStep(MIN_SCALE, -1)).toBe(MIN_SCALE);
    expect([...ZOOM_STEPS]).toEqual([...ZOOM_STEPS].sort((a, b) => a - b));
  });
});

describe('déplacement de la vue', () => {
  test('translate la toile', () => {
    expect(panView({ scale: 1, left: 0, top: 0 }, 30, -20, AREA)).toEqual({ mode: 'free', scale: 1, left: 30, top: -20 });
  });

  test('la toile ne quitte jamais complètement la zone, d’aucun côté', () => {
    const far = panView({ scale: 1, left: 0, top: 0 }, 99999, 99999, AREA);
    expect(far.left).toBeLessThan(AREA.areaWidth);
    expect(far.top).toBeLessThan(AREA.areaHeight);
    const gone = panView({ scale: 1, left: 0, top: 0 }, -99999, -99999, AREA);
    expect(gone.left + STAGE_WIDTH * 1).toBeGreaterThan(0);
    expect(gone.top + STAGE_HEIGHT * 1).toBeGreaterThan(0);
  });

  test('keepInView laisse intacte une toile déjà bien placée', () => {
    const placed = { scale: 0.5, left: 20, top: 30 };
    expect(keepInView(placed, AREA)).toEqual(placed);
  });
});

describe('conversions', () => {
  test('écran ↔ source sont inverses', () => {
    const t = { scale: 0.4, left: 50, top: 70 };
    const source = screenToSource(t, { x: 450, y: 270 });
    expect(source).toEqual({ x: 1000, y: 500 });
    expect(sourceToScreen(t, source)).toEqual({ x: 450, y: 270 });
  });
});
