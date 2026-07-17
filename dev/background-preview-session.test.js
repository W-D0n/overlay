import { describe, expect, test } from 'bun:test';
import {
  createBackgroundPreviewSession,
  defaultBackgroundOptions,
} from './background-preview-session.js';

describe('session d’aperçu du tuner', () => {
  test('construit des options par défaut indépendantes pour chaque sélection', () => {
    const first = defaultBackgroundOptions('RainBackground');
    const second = defaultBackgroundOptions('RainBackground');

    expect(first).toEqual({
      intensity: 0.5,
      speed: 1,
      color: '#C8B97A',
      angle: 8,
    });
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  test('sélectionner un effet initialise ses options et quitte le preset actif', () => {
    const session = createBackgroundPreviewSession();
    session.apply({ component: 'BubbleBackground', options: { count: 8 } }, 'bulles');

    const next = session.selectEffect('RainBackground');

    expect(next).toEqual({
      current: {
        component: 'RainBackground',
        options: { intensity: 0.5, speed: 1, color: '#C8B97A', angle: 8 },
      },
      activePresetId: null,
    });
  });

  test('appliquer un preset et modifier une option ne mute pas la source', () => {
    const preset = {
      component: 'RainBackground',
      options: { intensity: 0.3, speed: 1 },
    };
    const session = createBackgroundPreviewSession();
    session.apply(preset, 'pluie');
    session.changeOption('speed', 2);

    expect(session.snapshot()).toEqual({
      current: {
        component: 'RainBackground',
        options: { intensity: 0.3, speed: 2 },
      },
      activePresetId: 'pluie',
    });
    expect(preset.options.speed).toBe(1);
  });

  test('le snapshot ne permet pas de modifier la session depuis l’extérieur', () => {
    const session = createBackgroundPreviewSession();
    session.apply({ component: 'RainBackground', options: { speed: 1 } });
    const snapshot = session.snapshot();
    snapshot.current.options.speed = 99;

    expect(session.snapshot().current.options.speed).toBe(1);
  });
});
