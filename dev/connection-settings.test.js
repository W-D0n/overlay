import { describe, expect, test } from 'bun:test';
import { DEFAULT_OBS_URL, applyObsPatch, normalizeConnectionFile, publicObsView, resolveObs, validateObsPatch } from './connection-settings.js';

describe('normalizeConnectionFile', () => {
  test('un fichier vide ou absurde donne des réglages vides', () => {
    expect(normalizeConnectionFile({})).toEqual({ obs: {} });
    expect(normalizeConnectionFile(null)).toEqual({ obs: {} });
    expect(normalizeConnectionFile('texte')).toEqual({ obs: {} });
    expect(normalizeConnectionFile({ obs: 12 })).toEqual({ obs: {} });
  });

  test('ne garde que des textes non vides', () => {
    expect(normalizeConnectionFile({ obs: { url: 'ws://h:1', password: 'x' } })).toEqual({ obs: { url: 'ws://h:1', password: 'x' } });
    expect(normalizeConnectionFile({ obs: { url: 4, password: '' } })).toEqual({ obs: {} });
  });
});

describe('validateObsPatch', () => {
  test('accepte une adresse ws:// ou wss:// et un mot de passe', () => {
    expect(validateObsPatch({ url: ' ws://127.0.0.1:4455 ', password: 'secret' })).toEqual({ ok: true, patch: { url: 'ws://127.0.0.1:4455', password: 'secret' } });
    expect(validateObsPatch({ url: 'wss://obs.exemple.fr:443' }).ok).toBe(true);
  });

  test('un mot de passe garde ses espaces et ses caractères spéciaux', () => {
    const result = validateObsPatch({ password: '  é$"\\ ' });
    expect(result).toEqual({ ok: true, patch: { password: '  é$"\\ ' } });
  });

  test('null efface le mot de passe, une adresse vide revient au défaut', () => {
    expect(validateObsPatch({ password: null })).toEqual({ ok: true, patch: { password: null } });
    expect(validateObsPatch({ url: '' })).toEqual({ ok: true, patch: { url: null } });
  });

  test('refuse une adresse qui n’est pas WebSocket, sans hôte, ou avec un caractère de contrôle', () => {
    expect(validateObsPatch({ url: 'http://127.0.0.1:4455' }).ok).toBe(false);
    expect(validateObsPatch({ url: '127.0.0.1:4455' }).ok).toBe(false);
    expect(validateObsPatch({ url: 'ws://' }).ok).toBe(false);
    expect(validateObsPatch({ url: 'ws://h:1\nx' }).ok).toBe(false);
    expect(validateObsPatch({ url: 12 }).ok).toBe(false);
  });

  test('refuse un mot de passe vide, trop long, ou à caractère de contrôle', () => {
    expect(validateObsPatch({ password: '' }).ok).toBe(false);
    expect(validateObsPatch({ password: 'a'.repeat(257) }).ok).toBe(false);
    expect(validateObsPatch({ password: 'a\nb' }).ok).toBe(false);
    expect(validateObsPatch({ password: 'a'.repeat(256) }).ok).toBe(true);
    expect(validateObsPatch({ password: 7 }).ok).toBe(false);
  });

  test('refuse un corps sans rien à enregistrer ou qui n’est pas un objet', () => {
    expect(validateObsPatch({}).ok).toBe(false);
    expect(validateObsPatch(null).ok).toBe(false);
    expect(validateObsPatch('x').ok).toBe(false);
  });

  test('dit toutes les erreurs d’un coup', () => {
    const result = validateObsPatch({ url: 'http://x', password: '' });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors).toHaveLength(2);
  });
});

describe('applyObsPatch', () => {
  test('pose les valeurs et laisse le reste', () => {
    expect(applyObsPatch({ obs: { url: 'ws://a:1' } }, { password: 'p' })).toEqual({ obs: { url: 'ws://a:1', password: 'p' } });
  });

  test('null retire la valeur saisie', () => {
    expect(applyObsPatch({ obs: { url: 'ws://a:1', password: 'p' } }, { password: null })).toEqual({ obs: { url: 'ws://a:1' } });
    expect(applyObsPatch({ obs: { url: 'ws://a:1', password: 'p' } }, { url: null })).toEqual({ obs: { password: 'p' } });
  });

  test('ne modifie pas le fichier reçu', () => {
    const file = { obs: { password: 'p' } };
    applyObsPatch(file, { password: null });
    expect(file).toEqual({ obs: { password: 'p' } });
  });
});

describe('resolveObs', () => {
  test('la saisie du Studio l’emporte sur l’environnement', () => {
    const resolved = resolveObs({ file: { obs: { url: 'ws://studio:1', password: 'studio' } }, env: { OBS_WS_URL: 'ws://env:2', OBS_WS_PASSWORD: 'env' } });
    expect(resolved).toEqual({ url: 'ws://studio:1', password: 'studio', source: 'settings' });
  });

  test('sans saisie, l’environnement reste lu (une installation existante continue de marcher)', () => {
    expect(resolveObs({ file: { obs: {} }, env: { OBS_WS_URL: 'ws://env:2', OBS_WS_PASSWORD: 'env' } })).toEqual({ url: 'ws://env:2', password: 'env', source: 'env' });
  });

  test('sans rien : adresse par défaut, aucun mot de passe', () => {
    expect(resolveObs({ file: { obs: {} }, env: {} })).toEqual({ url: DEFAULT_OBS_URL, password: '', source: 'none' });
    expect(resolveObs({ file: { obs: {} }, env: { OBS_WS_URL: '', OBS_WS_PASSWORD: '' } })).toEqual({ url: DEFAULT_OBS_URL, password: '', source: 'none' });
  });

  test('l’adresse et le mot de passe se résolvent séparément', () => {
    expect(resolveObs({ file: { obs: { url: 'ws://studio:1' } }, env: { OBS_WS_PASSWORD: 'env' } })).toEqual({ url: 'ws://studio:1', password: 'env', source: 'env' });
  });
});

describe('publicObsView', () => {
  const status = { connected: true, reason: null, scenes: ['A'], activeScene: 'A' };

  test('dit qu’un mot de passe existe sans jamais le montrer', () => {
    const view = publicObsView({ url: 'ws://h:1', password: 'très-secret', source: 'settings' }, status, true);
    expect(view.passwordSet).toBe(true);
    expect(JSON.stringify(view)).not.toContain('très-secret');
    expect(Object.keys(view)).not.toContain('password');
  });

  test('sans mot de passe : non configuré', () => {
    const view = publicObsView({ url: DEFAULT_OBS_URL, password: '', source: 'none' }, { connected: false, reason: 'not-configured', scenes: [], activeScene: null }, false);
    expect(view).toMatchObject({ passwordSet: false, configured: false, source: 'none', urlFromSettings: false });
  });
});
