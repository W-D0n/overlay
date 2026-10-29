import { expect, test } from 'bun:test';
import { RENDER_REFERENCE } from '../render-reference.js';
import { createPreviewStage, fitStage, STAGE_HEIGHT, STAGE_WIDTH } from './preview-stage.js';

test('le cadre suit la résolution de référence, jamais une valeur recopiée', () => {
  expect([STAGE_WIDTH, STAGE_HEIGHT]).toEqual([RENDER_REFERENCE.width, RENDER_REFERENCE.height]);
});

test('le cadre garde le rapport de la source et reste centré dans la zone libre', () => {
  const { scale, left, top } = fitStage({ areaWidth: 1580, areaHeight: 1000 });
  expect(STAGE_WIDTH * scale + 2 * left).toBeCloseTo(1580, 6);
  expect(STAGE_HEIGHT * scale + 2 * top).toBeCloseTo(1000, 6);
  expect(scale).toBeCloseTo((1580 - 32) / 1920, 6);
});

test('sur un écran plus grand que la source, le cadre est agrandi pour remplir la zone', () => {
  const { scale } = fitStage({ areaWidth: 3200, areaHeight: 1800 });
  expect(scale).toBeGreaterThan(1);
  expect(STAGE_HEIGHT * scale).toBeCloseTo(1800 - 32, 6);
});

test('la hauteur limite l’échelle quand la zone est large et basse', () => {
  const { scale } = fitStage({ areaWidth: 3000, areaHeight: 600 });
  expect(scale).toBeCloseTo((600 - 32) / 1080, 6);
});

test('une zone libre nulle donne une échelle nulle, pas négative', () => {
  expect(fitStage({ areaWidth: 20, areaHeight: 20 }).scale).toBe(0);
});

test('createPreviewStage dimensionne le conteneur à 1920×1080 et suit la taille de la zone', () => {
  const layer = { style: {} };
  const container = { clientWidth: 1920, clientHeight: 1080 };
  let notify = () => {};
  let disconnected = false;
  class FakeObserver {
    constructor(callback) { notify = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  }
  const stage = createPreviewStage({ layer, container, windowRef: { ResizeObserver: FakeObserver } });
  expect(layer.style.width).toBe('1920px');
  expect(layer.style.height).toBe('1080px');
  expect(layer.style.transform).toBe(`scale(${(1080 - 32) / 1080})`);

  container.clientWidth = 1000;
  container.clientHeight = 1000;
  notify();
  expect(layer.style.transform).toBe(`scale(${(1000 - 32) / 1920})`);
  expect(layer.style.left).toBe('16px');

  stage.destroy();
  expect(disconnected).toBe(true);
});
