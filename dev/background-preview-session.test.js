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
      audioReactive: 'Non',
      audioIntensity: 1,
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
        options: {
          intensity: 0.5, speed: 1, color: '#C8B97A', angle: 8,
          audioReactive: 'Non', audioIntensity: 1,
        },
        showBranding: true,
      },
      activePresetId: null,
      showBranding: true,
      transition: { type: 'fade', durationMs: 600, direction: 'right', easing: 'easeInOut' },
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
        showBranding: true,
      },
      activePresetId: 'pluie',
      showBranding: true,
      transition: { type: 'fade', durationMs: 600, direction: 'right', easing: 'easeInOut' },
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

  test('l’arrivée d’un preset porte sa transition dans l’état diffusé', () => {
    const session = createBackgroundPreviewSession();
    const state = session.apply(
      {
        component: 'RainBackground',
        options: {},
        transition: { type: 'wipe', durationMs: 400, direction: 'up' },
      },
      'pluie',
    );

    expect(state.current.transition).toEqual({ type: 'wipe', durationMs: 400, direction: 'up', easing: 'easeInOut' });
  });

  test('un réglage qui suit l’arrivée ne rejoue pas la transition', () => {
    const session = createBackgroundPreviewSession();
    session.apply(
      { component: 'RainBackground', options: { speed: 1 }, transition: { type: 'wipe', durationMs: 400 } },
      'pluie',
    );

    expect(session.changeOption('speed', 2).current.transition).toBeUndefined();
    expect(session.snapshot().current.transition).toBeUndefined();
  });

  test('un preset sans transition arrive avec les valeurs par défaut', () => {
    const session = createBackgroundPreviewSession();
    const state = session.apply({ component: 'RainBackground', options: {} }, 'pluie');
    expect(state.current.transition).toEqual({ type: 'fade', durationMs: 600, direction: 'right', easing: 'easeInOut' });
  });

  test('changer la transition n’anime pas et borne les valeurs aberrantes', () => {
    const session = createBackgroundPreviewSession();
    session.apply({ component: 'RainBackground', options: {} }, 'pluie');

    const state = session.changeTransition({ type: 'wipe', durationMs: 99999 });
    expect(state.transition).toEqual({ type: 'wipe', durationMs: 2000, direction: 'right', easing: 'easeInOut' });
    expect(state.current.transition).toBeUndefined();
  });

  test('un preset qui masque le branding le transmet dans l’état diffusé', () => {
    const session = createBackgroundPreviewSession();
    const state = session.apply(
      { component: 'RainBackground', options: {}, showBranding: false },
      'discret',
    );
    expect(state.current.showBranding).toBe(false);
    expect(state.showBranding).toBe(false);
  });

  test('basculer la visibilité du branding n’attend pas un enregistrement de preset', () => {
    const session = createBackgroundPreviewSession();
    session.apply({ component: 'RainBackground', options: {} }, 'pluie');
    expect(session.setShowBranding(false).current.showBranding).toBe(false);
    expect(session.changeOption('speed', 3).current.showBranding).toBe(false);
  });
});
