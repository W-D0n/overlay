import { describe, expect, test } from 'bun:test';
import { backgroundPresetUrl, selectBackground } from './background-selection.js';

const file = {
  current: { component: 'RainBackground', options: { speed: 1 } },
  presets: [
    { id: 'discussion-calme', name: 'Discussion calme', component: 'BubbleBackground', options: { count: 12 } },
  ],
};

describe('sélection du fond standalone', () => {
  test('sans preset, suit le fond courant', () => {
    expect(selectBackground(file, null)).toEqual(file.current);
  });

  test('avec preset, résout son effet et ses options', () => {
    expect(selectBackground(file, 'discussion-calme')).toEqual({
      component: 'BubbleBackground',
      options: { count: 12 },
    });
  });

  test('un ancien lien par nom reste compatible après migration', () => {
    expect(selectBackground(file, 'Discussion calme')?.component).toBe('BubbleBackground');
  });

  test('un preset inconnu ne retombe jamais silencieusement sur le fond courant', () => {
    expect(selectBackground(file, 'Absent')).toBeNull();
  });

  test('backgroundPresetUrl encode l’identifiant stable et active la transparence OBS', () => {
    const url = new URL(backgroundPresetUrl('discussion-calme'));
    expect(url.searchParams.get('preset')).toBe('discussion-calme');
    expect(url.searchParams.get('transparent')).toBe('1');
  });

  test('backgroundPresetUrl peut demander le profil performance', () => {
    const url = new URL(backgroundPresetUrl('discussion-calme', undefined, { performance: true }));
    expect(url.searchParams.get('quality')).toBe('performance');
  });
});
