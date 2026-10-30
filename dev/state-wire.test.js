import { describe, expect, test } from 'bun:test';
import { sceneFromCurrent, sceneFromPreset } from '../scene-doc.js';
import { emptyLiveScene } from './background-state-format.js';
import {
  sceneFromWireCurrent,
  sceneFromWirePreset,
  wireBroadcast,
  wireCurrent,
  wireDrafts,
  wireHistory,
  wirePreset,
  wireState,
} from './state-wire.js';

const TRANSITION = { type: 'wipe', durationMs: 400, direction: 'up', easing: 'linear' };

/** Les états en forme plate que les pages de rendu et le Studio échangent, sous toutes leurs formes. */
const CURRENTS = {
  'un effet, branding affiché': { component: 'rain', options: { speed: 2 } },
  'branding masqué': { component: 'rain', options: {}, showBranding: false },
  'avec transition': { component: 'bubble', options: { count: 5 }, transition: TRANSITION },
  'aucun fond, branding affiché': { component: null, options: {} },
  'aucun fond, branding masqué': { component: null, options: {}, showBranding: false },
};

describe('état en antenne : forme plate ↔ scène', () => {
  for (const [name, current] of Object.entries(CURRENTS)) {
    test(`${name} : la conversion aller-retour redonne l’état envoyé`, () => {
      const received = sceneFromWireCurrent(current);
      expect(received.ok).toBe(true);
      expect(wireCurrent(received.scene)).toEqual(current);
    });
  }

  test('un client qui envoie l’ancien nom d’effet ou « Oui » est lu en forme neutre', () => {
    const received = sceneFromWireCurrent({ component: 'RainBackground', options: { audioReactive: 'Oui' } });
    expect(received.ok).toBe(true);
    expect(wireCurrent(received.scene)).toEqual({ component: 'rain', options: { audioReactive: true } });
  });

  test('un état invalide est refusé avec ses erreurs, jamais converti', () => {
    expect(sceneFromWireCurrent({ component: 'Inconnu', options: {} })).toEqual({ ok: false, errors: ['effet de fond inconnu : Inconnu'] });
    expect(sceneFromWireCurrent({ component: 'rain', options: {}, showBranding: 'non' }).ok).toBe(false);
    expect(sceneFromWireCurrent(null).ok).toBe(false);
  });

  test('une scène qui n’a pas de forme plate donne une antenne plate vide et aucun preset plat, jamais une version tronquée', () => {
    const scene = sceneFromCurrent({ component: 'rain', options: {} });
    const twoEffects = { ...scene, layers: [scene.layers[0], { ...scene.layers[0], id: 'second' }] };
    expect(wireCurrent(twoEffects)).toEqual({ component: null, options: {}, showBranding: false });
    expect(wirePreset({ ...twoEffects, id: 'a', name: 'A' })).toBeNull();
    expect(wireBroadcast(twoEffects).scene).toBe(twoEffects);
  });
});

describe('preset : forme plate ↔ scène', () => {
  const preset = { id: 'nuit', name: 'Nuit', component: 'rain', options: { speed: 2 }, tags: ['calme'], transition: TRANSITION, showBranding: false };

  test('un preset complet fait l’aller-retour', () => {
    const received = sceneFromWirePreset(preset);
    expect(received.ok).toBe(true);
    expect(wirePreset(received.scene)).toEqual(preset);
  });

  test('un preset invalide est refusé avec ses erreurs', () => {
    const received = sceneFromWirePreset({ ...preset, component: 'Inconnu' });
    expect(received.ok).toBe(false);
    expect(received.errors).toContain('effet de fond inconnu : Inconnu');
  });
});

describe('état complet, historique et brouillons', () => {
  const file = () => ({
    version: 4,
    current: sceneFromCurrent(CURRENTS['avec transition']),
    scenes: [sceneFromPreset({ id: 'nuit', name: 'Nuit', component: 'rain', options: {} })],
    sceneMap: { Jeu: 'nuit' },
    branding: { name: 'D0n' },
    history: [{ at: '2026-10-30T10:00:00.000Z', scene: emptyLiveScene() }],
    drafts: { nuit: { at: '2026-10-30T11:00:00.000Z', scene: sceneFromCurrent(CURRENTS['branding masqué']) } },
  });

  test('GET /state : scènes et forme plate, historique et brouillons absents, le reste conservé', () => {
    const f = file();
    expect(wireState(f)).toEqual({
      version: 4,
      current: CURRENTS['avec transition'],
      scene: f.current,
      presets: [{ id: 'nuit', name: 'Nuit', component: 'rain', options: {} }],
      scenes: f.scenes,
      sceneMap: { Jeu: 'nuit' },
      branding: { name: 'D0n' },
    });
  });

  test('un preset sans forme plate reste dans `scenes` et sort de `presets`', () => {
    const f = file();
    const stacked = { ...f.scenes[0], id: 'pile', name: 'Pile', layers: [...f.scenes[0].layers, { ...f.scenes[0].layers[0], id: 'second' }] };
    const state = wireState({ ...f, scenes: [...f.scenes, stacked] });
    expect(state.scenes.map(({ id }) => id)).toEqual(['nuit', 'pile']);
    expect(state.presets.map(({ id }) => id)).toEqual(['nuit']);
  });

  test('l’historique garde ses instants et rend chaque scène en forme plate, scène vide comprise', () => {
    expect(wireHistory(file().history)).toEqual([{ at: '2026-10-30T10:00:00.000Z', current: CURRENTS['aucun fond, branding masqué'], scene: emptyLiveScene() }]);
  });

  test('les brouillons sont rendus par identifiant de preset, sous la clé `state` des clients', () => {
    expect(wireDrafts(file().drafts)).toEqual({ nuit: { at: '2026-10-30T11:00:00.000Z', state: CURRENTS['branding masqué'], scene: file().drafts.nuit.scene } });
  });
});
