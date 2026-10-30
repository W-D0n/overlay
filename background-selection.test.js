import { describe, expect, test } from 'bun:test';
import {
  backgroundCurrentUrl,
  backgroundPresetUrl,
  liveSceneOf,
  selectScene,
} from './background-selection.js';
import { STATIC_PORT } from './ports.config.js';
import { sceneFromCurrent, sceneFromPreset } from './scene-doc.js';

const file = {
  current: { component: 'RainBackground', options: { speed: 1 } },
  presets: [
    { id: 'discussion-calme', name: 'Discussion calme', component: 'BubbleBackground', options: { count: 12 } },
  ],
};

const layer = (id, kind, over = {}) => ({ id, kind, visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: {}, ...over });
const STACK = { version: 1, id: 'pile', name: 'Pile', layers: [layer('fond', 'rain'), layer('bulles', 'bubble', { opacity: 0.5 })] };
const kinds = (scene) => scene.layers.map((l) => l.kind);

describe('sélection du fond standalone', () => {
  test('sans preset, suit la scène en antenne ; d’un serveur sans `scene`, celle de la forme plate', () => {
    expect(kinds(selectScene(file, null))).toEqual(['rain', 'branding']);
    expect(selectScene({ ...file, scene: STACK }, null)).toBe(STACK);
    expect(selectScene({ ...file, scene: STACK }, '')).toBe(STACK);
  });

  test('avec preset, résout toutes ses couches ; d’un serveur sans `scenes`, la scène de la forme plate', () => {
    expect(kinds(selectScene(file, 'discussion-calme'))).toEqual(['bubble', 'branding']);
    expect(selectScene({ ...file, scenes: [STACK] }, 'pile')).toBe(STACK);
  });

  test('le preset garde sa transition et son branding masqué, que la forme plate perdait', () => {
    const quiet = { id: 'calme', name: 'Calme', component: 'rain', options: {}, showBranding: false, transition: { type: 'fade', durationMs: 300 } };
    const scene = selectScene({ ...file, scenes: [sceneFromPreset(quiet)] }, 'calme');
    expect(kinds(scene)).toEqual(['rain']);
    expect(scene.transition).toEqual({ type: 'fade', durationMs: 300 });
  });

  test('un ancien lien par nom reste compatible après migration', () => {
    expect(selectScene(file, 'Discussion calme')?.id).toBe('discussion-calme');
    expect(selectScene({ ...file, scenes: [STACK] }, 'Pile')).toBe(STACK);
  });

  test('un preset inconnu ne retombe jamais silencieusement sur le fond courant', () => {
    expect(selectScene(file, 'Absent')).toBeNull();
    expect(selectScene({ ...file, scenes: [STACK] }, 'Absent')).toBeNull();
  });

  test('liveSceneOf : la `scene` d’un message, sinon la scène de sa forme plate', () => {
    expect(liveSceneOf({ component: null, options: {}, showBranding: false, scene: STACK })).toBe(STACK);
    expect(liveSceneOf({ component: 'rain', options: {} })).toEqual(sceneFromCurrent({ component: 'rain', options: {} }));
  });

  test('backgroundPresetUrl encode l’identifiant stable et active la transparence OBS', () => {
    const url = new URL(backgroundPresetUrl('discussion-calme'));
    expect(url.searchParams.get('preset')).toBe('discussion-calme');
    expect(url.searchParams.get('transparent')).toBe('1');
  });

  test('backgroundCurrentUrl suit le tuner avec transparence', () => {
    expect(backgroundCurrentUrl()).toBe(`http://localhost:${STATIC_PORT}/background.html?transparent=1`);
  });
});
