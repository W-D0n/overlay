import { describe, expect, test } from 'bun:test';
import { MAX_AMOUNT, MAX_USERNAME_LENGTH, normalizeAlert } from './alert-event.js';

describe('normalizeAlert', () => {
  test('les quatre types d’alerte passent', () => {
    for (const type of ['follow', 'sub', 'raid', 'bits']) expect(normalizeAlert({ type })).toEqual({ ok: true, alert: { type } });
  });

  test('garde le pseudo et le montant, rien d’autre', () => {
    const result = normalizeAlert({ type: 'raid', username: 'Mozaik', amount: 42, secret: 'x', html: '<b>', extra: { a: 1 } });
    expect(result).toEqual({ ok: true, alert: { type: 'raid', username: 'Mozaik', amount: 42 } });
  });

  test('un type absent, inconnu ou mal typé est refusé avec la liste attendue', () => {
    for (const bad of [{}, { type: 'unknown' }, { type: 4 }, { type: null }]) {
      const result = normalizeAlert(bad);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toContain('follow, sub, raid, bits');
    }
  });

  test('ce qui n’est pas un objet est refusé', () => {
    for (const bad of [null, undefined, 'follow', 7, true]) expect(normalizeAlert(bad).ok).toBe(false);
  });

  test('le pseudo est nettoyé : espaces, caractères de contrôle, longueur', () => {
    expect(normalizeAlert({ type: 'follow', username: '  Zoé\n\t ' })).toEqual({ ok: true, alert: { type: 'follow', username: 'Zoé' } });
    expect(normalizeAlert({ type: 'follow', username: 'a\u0000b\u001fc\u007f' })).toEqual({ ok: true, alert: { type: 'follow', username: 'abc' } });
    const long = normalizeAlert({ type: 'follow', username: 'x'.repeat(MAX_USERNAME_LENGTH + 40) });
    expect(long.ok && long.alert.username).toHaveLength(MAX_USERNAME_LENGTH);
  });

  test('un pseudo vide ou qui n’est pas un texte est omis, sans refuser l’alerte', () => {
    expect(normalizeAlert({ type: 'follow', username: '   ' })).toEqual({ ok: true, alert: { type: 'follow' } });
    expect(normalizeAlert({ type: 'follow', username: 12 })).toEqual({ ok: true, alert: { type: 'follow' } });
  });

  test('le montant est un entier borné ; négatif, infini ou texte sont omis', () => {
    expect(normalizeAlert({ type: 'bits', amount: 12.9 })).toEqual({ ok: true, alert: { type: 'bits', amount: 12 } });
    expect(normalizeAlert({ type: 'bits', amount: 0 })).toEqual({ ok: true, alert: { type: 'bits', amount: 0 } });
    expect(normalizeAlert({ type: 'bits', amount: MAX_AMOUNT * 10 })).toEqual({ ok: true, alert: { type: 'bits', amount: MAX_AMOUNT } });
    for (const amount of [-1, Infinity, NaN, '25', null]) expect(normalizeAlert({ type: 'bits', amount })).toEqual({ ok: true, alert: { type: 'bits' } });
  });
});
