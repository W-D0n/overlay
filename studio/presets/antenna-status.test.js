import { describe, expect, test } from 'bun:test';
import { antennaItems, antennaSummary } from './antenna-status.js';

const connectedObs = { connected: true, configured: true, reason: null, activeScene: 'Discussion' };
const base = { serverReachable: true, obs: connectedObs, renderPages: 1, audio: null };

const tones = (items) => Object.fromEntries(items.map(({ id, tone }) => [id, tone]));

describe('bandeau d’antenne', () => {
  test('tout est prêt : serveur, OBS avec sa scène, une page de rendu', () => {
    const items = antennaItems(base);
    expect(tones(items)).toEqual({ server: 'ok', obs: 'ok', render: 'ok' });
    expect(items.find(({ id }) => id === 'obs')?.detail).toContain('Discussion');
    expect(antennaSummary(items)).toEqual({ tone: 'ok', text: 'Prêt' });
    expect(items.find(({ id }) => id === 'render')?.short).toBe('1');
    expect(items.find(({ id }) => id === 'obs')?.short).toBe('Discussion');
  });

  test('un serveur injoignable bloque et ne juge pas le reste', () => {
    const items = antennaItems({ ...base, serverReachable: false });
    expect(items.map(({ id }) => id)).toEqual(['server']);
    expect(antennaSummary(items).tone).toBe('bad');
  });

  test('aucune page de rendu connectée est signalé avec la marche à suivre', () => {
    const items = antennaItems({ ...base, renderPages: 0 });
    expect(tones(items).render).toBe('warn');
    expect(items.find(({ id }) => id === 'render')?.detail).toContain('rafraîchir');
    expect(items.find(({ id }) => id === 'render')?.short).toBe('aucune');
    expect(antennaSummary(items).tone).toBe('warn');
  });

  test('un serveur qui ne sait pas compter les pages (ancien code) n’alarme pas', () => {
    const items = antennaItems({ ...base, renderPages: null });
    expect(tones(items).render).toBe('off');
    expect(antennaSummary(items).tone).toBe('ok');
  });

  test('OBS : non configuré neutre, fermé en alerte, mot de passe refusé bloquant', () => {
    const obs = (patch) => tones(antennaItems({ ...base, obs: { ...connectedObs, ...patch } })).obs;
    expect(obs({ configured: false, connected: false })).toBe('off');
    expect(obs({ connected: false, reason: 'closed' })).toBe('warn');
    expect(obs({ connected: false, reason: 'auth-rejected' })).toBe('bad');
    expect(obs({ connected: false, reason: 'connecting' })).toBe('warn');
  });

  test('le micro n’apparaît que s’il est demandé', () => {
    expect(antennaItems(base).some(({ id }) => id === 'audio')).toBe(false);
    const items = antennaItems({ ...base, audio: { status: 'unavailable', reason: 'micro refusé' } });
    expect(tones(items).audio).toBe('warn');
    expect(items.find(({ id }) => id === 'audio')?.detail).toBe('micro refusé');
    expect(tones(antennaItems({ ...base, audio: { status: 'active', reason: null } })).audio).toBe('ok');
  });
});
