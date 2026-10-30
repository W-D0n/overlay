import { describe, expect, test } from 'bun:test';
import { validateDrafts, withDraft, withDrafts, withoutDraft } from './preset-drafts.js';

const STATE = { component: 'rain', options: {} };
const AT = '2026-10-30T10:00:00.000Z';

describe('withDraft / withoutDraft', () => {
  test('range et retire sans modifier l’original', () => {
    const original = Object.freeze({});
    const one = withDraft(original, 'a', STATE, AT);
    expect(one).toEqual({ a: { at: AT, state: STATE } });
    expect(withoutDraft(one, 'a')).toBeUndefined();
    expect(Object.keys(one)).toEqual(['a']);
  });

  test('remplace le brouillon du même preset, garde les autres', () => {
    const drafts = withDraft(withDraft(undefined, 'a', STATE, AT), 'b', STATE, AT);
    const next = withDraft(drafts, 'a', { component: 'bubble', options: {} }, '2026-10-30T11:00:00.000Z');
    expect(next.a.state.component).toBe('bubble');
    expect(next.b.state.component).toBe('rain');
    expect(Object.keys(withoutDraft(next, 'a'))).toEqual(['b']);
  });

  test('retirer un brouillon absent ne change rien', () => {
    const drafts = withDraft(undefined, 'a', STATE, AT);
    expect(withoutDraft(drafts, 'z')).toBe(drafts);
    expect(withoutDraft(undefined, 'z')).toBeUndefined();
  });
});

describe('withDrafts', () => {
  test('sans brouillon, la clé disparaît du fichier', () => {
    expect('drafts' in withDrafts({ presets: [], drafts: { a: { at: AT, state: STATE } } }, undefined)).toBe(false);
    expect(withDrafts({ presets: [] }, { a: { at: AT, state: STATE } }).drafts.a.at).toBe(AT);
  });
});

describe('validateDrafts', () => {
  const context = { presetIds: new Set(['a']), validateState: () => [] };

  test('absent : valide', () => expect(validateDrafts(undefined, context)).toEqual([]));

  test('refuse la forme, un preset inconnu, une date illisible, un état sans effet ou invalide', () => {
    expect(validateDrafts([], context)).toEqual(['drafts : objet attendu']);
    expect(validateDrafts({ z: { at: AT, state: STATE } }, context)[0]).toContain('preset inconnu');
    expect(validateDrafts({ a: null }, context)[0]).toContain('objet attendu');
    expect(validateDrafts({ a: { at: 'hier', state: STATE } }, context)[0]).toContain('date ISO');
    expect(validateDrafts({ a: { at: AT, state: { component: null, options: {} } } }, context)[0]).toContain('effet est requis');
    expect(validateDrafts({ a: { at: AT, state: STATE } }, { ...context, validateState: () => ['option fausse'] })[0]).toBe('drafts[a].state : option fausse');
    expect(validateDrafts({ a: { at: AT, state: STATE } }, context)).toEqual([]);
  });
});
