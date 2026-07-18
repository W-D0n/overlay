import { describe, expect, test } from 'bun:test';
import {
  createBackgroundReadinessController,
  readinessRevealDelays,
} from './background-readiness-controller.js';

describe('replay du contrôle avant live', () => {
  test('révèle les étapes dans leur ordre avec un décalage régulier', () => {
    expect(readinessRevealDelays(5, 90, false)).toEqual([0, 90, 180, 270, 360]);
  });

  test('annule le décalage quand la réduction de mouvement est demandée', () => {
    expect(readinessRevealDelays(5, 90, true)).toEqual([0, 0, 0, 0, 0]);
  });

  test('un rapport vide ne planifie aucune animation', () => {
    expect(readinessRevealDelays(0, 90, false)).toEqual([]);
  });
});

function readinessHarness(status) {
  const root = {
    dataset: {},
    open: false,
    setAttribute() {},
    removeAttribute() {},
  };
  const controller = createBackgroundReadinessController({
    root,
    title: { textContent: '' },
    summary: { textContent: '' },
    checks: { replaceChildren() {}, appendChild() {} },
    runButton: { disabled: false, textContent: '', onclick: null },
    stateServer: 'http://localhost:4174',
    getSelection: () => ({ presetId: null, quality: 'auto' }),
    getRuntime: () => ({ fps: 60, pixelRatio: 1, paused: false }),
    focusEffect() {},
    focusPresets() {},
    collect: async () => ({ status, checks: [] }),
    documentRef: { documentElement: {} },
    navigatorRef: { clipboard: { writeText: async () => {} } },
    windowRef: {
      matchMedia: () => ({ matches: true }),
      getComputedStyle: () => ({ getPropertyValue: () => '90ms' }),
    },
  });
  return { root, controller };
}

test('ouvre automatiquement Avant le live quand un point est bloquant', async () => {
  const { root, controller } = readinessHarness('blocking');
  await controller.run();
  expect(root.open).toBe(true);
});

test('laisse Avant le live replié quand aucun point ne bloque', async () => {
  const { root, controller } = readinessHarness('ready');
  await controller.run();
  expect(root.open).toBe(false);
});
