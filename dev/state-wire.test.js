import { describe, expect, test } from 'bun:test';
import { sceneFromCurrent, sceneFromPreset } from '../scene-doc.js';
import { emptyLiveScene } from './background-state-format.js';
import {
  sceneFromWireCurrent,
  sceneFromWirePreset,
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

  test('une scène qui n’a pas de forme plate lève au lieu de partir tronquée', () => {
    const scene = sceneFromCurrent({ component: 'rain', options: {} });
    const twoEffects = { ...scene, layers: [scene.layers[0], { ...scene.layers[0], id: 'second' }] };
    expect(() => wireCurrent(twoEffects)).toThrow('sans forme plate');
    expect(() => wirePreset({ ...twoEffects, id: 'a', name: 'A' })).toThrow('sans forme plate');
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

  test('GET /state : états et presets en forme plate, historique et brouillons absents, le reste conservé', () => {
    expect(wireState(file())).toEqual({
      version: 4,
      current: CURRENTS['avec transition'],
      presets: [{ id: 'nuit', name: 'Nuit', component: 'rain', options: {} }],
      sceneMap: { Jeu: 'nuit' },
      branding: { name: 'D0n' },
    });
  });

  test('l’historique garde ses instants et rend chaque scène en forme plate, scène vide comprise', () => {
    expect(wireHistory(file().history)).toEqual([{ at: '2026-10-30T10:00:00.000Z', current: CURRENTS['aucun fond, branding masqué'] }]);
  });

  test('les brouillons sont rendus par identifiant de preset, sous la clé `state` des clients', () => {
    expect(wireDrafts(file().drafts)).toEqual({ nuit: { at: '2026-10-30T11:00:00.000Z', state: CURRENTS['branding masqué'] } });
  });
});
