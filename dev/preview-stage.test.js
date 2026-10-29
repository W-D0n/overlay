import { expect, test } from 'bun:test';
import { createPreviewStage, fitStage, STAGE_HEIGHT, STAGE_WIDTH } from './preview-stage.js';

test('le cadre garde le rapport 16:9 et reste centré dans la zone libre', () => {
  const { scale, left, top } = fitStage({ areaWidth: 1920, areaHeight: 1080, insetLeft: 340 });
  expect(STAGE_WIDTH * scale + 2 * (left - 340)).toBeCloseTo(1920 - 340, 6);
  expect(STAGE_HEIGHT * scale + 2 * top).toBeCloseTo(1080, 6);
  expect(scale).toBeCloseTo((1920 - 340 - 32) / 1920, 6);
});

test('le cadre n’est jamais agrandi au-delà de la taille réelle', () => {
  expect(fitStage({ areaWidth: 5000, areaHeight: 4000 }).scale).toBe(1);
});

test('la hauteur limite l’échelle quand la zone est large et basse', () => {
  const { scale } = fitStage({ areaWidth: 3000, areaHeight: 600 });
  expect(scale).toBeCloseTo((600 - 32) / 1080, 6);
});

test('une zone libre nulle donne une échelle nulle, pas négative', () => {
  expect(fitStage({ areaWidth: 100, areaHeight: 100, insetLeft: 340 }).scale).toBe(0);
});

test('createPreviewStage dimensionne le conteneur à 1920×1080 et suit le repli du panneau', () => {
  const layer = { style: {} };
  const sidebar = { offsetWidth: 340, classList: { contains: (name) => name === 'collapsed' && collapsed } };
  let collapsed = false;
  const listeners = {};
  const windowRef = { innerWidth: 1920, innerHeight: 1080, addEventListener: (type, fn) => { listeners[type] = fn; } };
  const stage = createPreviewStage({ layer, sidebar, windowRef });
  expect(layer.style.width).toBe('1920px');
  expect(layer.style.height).toBe('1080px');
  const withSidebar = layer.style.transform;
  collapsed = true;
  stage.refresh();
  expect(layer.style.transform).not.toBe(withSidebar);
  expect(layer.style.transform).toBe(`scale(${(1080 - 32) / 1080})`);
  windowRef.innerWidth = 1000;
  listeners.resize();
  expect(layer.style.left).toBe('16px');
});
