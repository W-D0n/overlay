import { describe, expect, test } from 'bun:test';
import { describeAlert, describeTwitchat, formatAgo, twitchatSample } from './connection-view.js';

const NOW = Date.parse('2026-10-31T12:00:00.000Z');
const ago = (seconds) => new Date(NOW - seconds * 1000).toISOString();

describe('formatAgo', () => {
  test('secondes, minutes, heures', () => {
    expect(formatAgo(ago(0), NOW)).toBe('il y a 0 s');
    expect(formatAgo(ago(12), NOW)).toBe('il y a 12 s');
    expect(formatAgo(ago(59), NOW)).toBe('il y a 59 s');
    expect(formatAgo(ago(60), NOW)).toBe('il y a 1 min');
    expect(formatAgo(ago(3 * 60), NOW)).toBe('il y a 3 min');
    expect(formatAgo(ago(3600), NOW)).toBe('il y a 1 h');
    expect(formatAgo(ago(7200), NOW)).toBe('il y a 2 h');
  });

  test('un instant dans le futur (horloges décalées) se lit « 0 s », jamais négatif', () => {
    expect(formatAgo(ago(-30), NOW)).toBe('il y a 0 s');
  });
});

describe('describeTwitchat', () => {
  const none = { clients: 0, lastAlertAt: null, lastError: null };

  test('aucune connexion : on attend Twitchat, avec attention', () => {
    expect(describeTwitchat(none, NOW)).toEqual({ tone: 'attention', text: 'En attente de Twitchat : aucune connexion pour l’instant.' });
  });

  test('un client sans problème : prêt', () => {
    expect(describeTwitchat({ ...none, clients: 1 }, NOW)).toEqual({ tone: 'ready', text: 'Twitchat est connecté.' });
    expect(describeTwitchat({ ...none, clients: 2 }, NOW).text).toBe('2 connexions de Twitchat.');
  });

  test('la dernière alerte et le dernier problème sont dits', () => {
    const view = describeTwitchat({ clients: 1, lastAlertAt: ago(12), lastError: 'message refusé : jeton manquant' }, NOW);
    expect(view.text).toBe('Twitchat est connecté. Dernière alerte : il y a 12 s. Dernier problème : message refusé : jeton manquant.');
    expect(view.tone).toBe('attention');
  });

  test('un problème même avec un client connecté : attention', () => {
    expect(describeTwitchat({ clients: 1, lastAlertAt: null, lastError: 'x' }, NOW).tone).toBe('attention');
  });
});

describe('describeAlert', () => {
  test('type, pseudo, montant et source', () => {
    expect(describeAlert({ source: 'twitchat', type: 'raid', username: 'Zoé', amount: 25 })).toBe('Raid Zoé (25) — Twitchat');
    expect(describeAlert({ source: 'studio', type: 'follow' })).toBe('Follow — Studio (test)');
    expect(describeAlert({ source: 'twitch', type: 'bits', username: 'B', amount: 100 })).toBe('Bits B (100) — Twitch');
  });

  test('un type ou une source inconnus restent lisibles', () => {
    expect(describeAlert({ source: 'autre', type: 'raid?' })).toBe('raid? — autre');
  });
});

describe('twitchatSample', () => {
  test('un message plat avec les placeholders de Twitchat', () => {
    expect(JSON.parse(twitchatSample('follow', null))).toEqual({ type: 'follow', username: '{USER}' });
    expect(JSON.parse(twitchatSample('sub', null))).toEqual({ type: 'sub', username: '{USER}' });
    expect(JSON.parse(twitchatSample('raid', null))).toEqual({ type: 'raid', username: '{USER}', amount: '{VIEWERS}' });
    expect(JSON.parse(twitchatSample('bits', null))).toEqual({ type: 'bits', username: '{USER}', amount: '{BITS}' });
  });

  test('avec le jeton quand l’adresse de Twitchat ne peut pas le porter', () => {
    expect(JSON.parse(twitchatSample('follow', 'abc'))).toEqual({ type: 'follow', username: '{USER}', token: 'abc' });
  });

  test('le modèle est accepté par l’adaptateur une fois les placeholders remplacés', async () => {
    const { translateTwitchatMessage } = await import('./twitchat-adapter.js');
    const filled = twitchatSample('raid', null).replace('{USER}', 'Zoé').replace('{VIEWERS}', '42');
    expect(translateTwitchatMessage(JSON.parse(filled))).toEqual({ ok: true, alert: { type: 'raid', username: 'Zoé', amount: 42 } });
  });
});
