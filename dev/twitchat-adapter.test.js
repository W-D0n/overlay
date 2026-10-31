import { describe, expect, test } from 'bun:test';
import { translateTwitchatMessage } from './twitchat-adapter.js';

describe('translateTwitchatMessage', () => {
  test('le format documenté passe tel quel', () => {
    expect(translateTwitchatMessage({ type: 'follow', username: 'Zoé' })).toEqual({ ok: true, alert: { type: 'follow', username: 'Zoé' } });
    expect(translateTwitchatMessage({ type: 'raid', username: 'Zoé', amount: 25 })).toEqual({ ok: true, alert: { type: 'raid', username: 'Zoé', amount: 25 } });
  });

  test('les placeholders de Twitchat arrivent en texte : un montant « 25 » devient 25', () => {
    expect(translateTwitchatMessage({ type: 'bits', username: 'Zoé', amount: '150' })).toEqual({ ok: true, alert: { type: 'bits', username: 'Zoé', amount: 150 } });
    expect(translateTwitchatMessage({ type: 'bits', amount: ' 12 ' })).toEqual({ ok: true, alert: { type: 'bits', amount: 12 } });
    expect(translateTwitchatMessage({ type: 'bits', amount: '1,5' })).toEqual({ ok: true, alert: { type: 'bits', amount: 1 } });
  });

  test('un montant qui n’est pas un nombre est omis (l’alerte passe sans lui)', () => {
    expect(translateTwitchatMessage({ type: 'raid', amount: '{VIEWERS}' })).toEqual({ ok: true, alert: { type: 'raid' } });
    expect(translateTwitchatMessage({ type: 'raid', amount: '' })).toEqual({ ok: true, alert: { type: 'raid' } });
    expect(translateTwitchatMessage({ type: 'raid', amount: '12abc' })).toEqual({ ok: true, alert: { type: 'raid' } });
  });

  test('la casse et les espaces du type sont pardonnés', () => {
    expect(translateTwitchatMessage({ type: ' FOLLOW ' })).toEqual({ ok: true, alert: { type: 'follow' } });
    expect(translateTwitchatMessage({ type: 'Raid' })).toEqual({ ok: true, alert: { type: 'raid' } });
  });

  test('les synonymes courants sont reconnus', () => {
    expect(translateTwitchatMessage({ type: 'subscription' }).ok && translateTwitchatMessage({ type: 'subscription' }).alert.type).toBe('sub');
    expect(translateTwitchatMessage({ type: 'resub' }).ok && translateTwitchatMessage({ type: 'resub' }).alert.type).toBe('sub');
    expect(translateTwitchatMessage({ type: 'cheer' }).ok && translateTwitchatMessage({ type: 'cheer' }).alert.type).toBe('bits');
    expect(translateTwitchatMessage({ type: 'followed' }).ok && translateTwitchatMessage({ type: 'followed' }).alert.type).toBe('follow');
  });

  test('le pseudo se lit sous plusieurs noms, le premier présent gagnant', () => {
    expect(translateTwitchatMessage({ type: 'follow', user: 'A' })).toMatchObject({ alert: { username: 'A' } });
    expect(translateTwitchatMessage({ type: 'follow', login: 'b' })).toMatchObject({ alert: { username: 'b' } });
    expect(translateTwitchatMessage({ type: 'follow', displayName: 'C' })).toMatchObject({ alert: { username: 'C' } });
    expect(translateTwitchatMessage({ type: 'follow', username: '', user: 'D' })).toMatchObject({ alert: { username: 'D' } });
    expect(translateTwitchatMessage({ type: 'follow', username: 'premier', user: 'second' })).toMatchObject({ alert: { username: 'premier' } });
  });

  test('le montant se lit sous plusieurs noms (viewers pour un raid, bits…)', () => {
    expect(translateTwitchatMessage({ type: 'raid', viewers: '30' })).toMatchObject({ alert: { amount: 30 } });
    expect(translateTwitchatMessage({ type: 'bits', bits: 50 })).toMatchObject({ alert: { amount: 50 } });
    expect(translateTwitchatMessage({ type: 'sub', count: '3' })).toMatchObject({ alert: { amount: 3 } });
  });

  test('un type inconnu est refusé avec la raison', () => {
    const result = translateTwitchatMessage({ type: 'MESSAGE_FIRST' });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('message_first');
  });

  test('ce qui n’est pas un objet JSON est refusé', () => {
    for (const bad of [null, undefined, 'follow', 3, ['follow']]) {
      const result = translateTwitchatMessage(bad);
      expect(result.ok).toBe(false);
    }
  });

  test('le jeton et les champs inconnus ne vont pas plus loin', () => {
    expect(translateTwitchatMessage({ type: 'follow', username: 'Z', token: 'secret', extra: 1 })).toEqual({ ok: true, alert: { type: 'follow', username: 'Z' } });
  });
});
