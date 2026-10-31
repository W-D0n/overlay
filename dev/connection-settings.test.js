import { describe, expect, test } from 'bun:test';
import { DEFAULT_OBS_URL, applyObsPatch, newTwitchatToken, normalizeConnectionFile, publicObsView, resolveObs, twitchatAddress, validateObsPatch, withTwitchatToken } from './connection-settings.js';

describe('normalizeConnectionFile', () => {
  test('un fichier vide ou absurde donne des réglages vides', () => {
    expect(normalizeConnectionFile({})).toEqual({ obs: {}, twitchat: {} });
    expect(normalizeConnectionFile(null)).toEqual({ obs: {}, twitchat: {} });
    expect(normalizeConnectionFile('texte')).toEqual({ obs: {}, twitchat: {} });
    expect(normalizeConnectionFile({ obs: 12, twitchat: 'x' })).toEqual({ obs: {}, twitchat: {} });
  });

  test('ne garde que des textes non vides', () => {
    expect(normalizeConnectionFile({ obs: { url: 'ws://h:1', password: 'x' } })).toEqual({ obs: { url: 'ws://h:1', password: 'x' }, twitchat: {} });
    expect(normalizeConnectionFile({ obs: { url: 4, password: '' } })).toEqual({ obs: {}, twitchat: {} });
  });

  test('garde un jeton Twitchat bien formé et écarte les autres', () => {
    const token = 'a'.repeat(48);
    expect(normalizeConnectionFile({ twitchat: { token } }).twitchat).toEqual({ token });
    expect(normalizeConnectionFile({ twitchat: { token: 'court' } }).twitchat).toEqual({});
    expect(normalizeConnectionFile({ twitchat: { token: 'Z'.repeat(48) } }).twitchat).toEqual({});
    expect(normalizeConnectionFile({ twitchat: { token: 12 } }).twitchat).toEqual({});
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
    expect(applyObsPatch({ obs: { url: 'ws://a:1' }, twitchat: {} }, { password: 'p' })).toEqual({ obs: { url: 'ws://a:1', password: 'p' }, twitchat: {} });
  });

  test('null retire la valeur saisie', () => {
    expect(applyObsPatch({ obs: { url: 'ws://a:1', password: 'p' }, twitchat: {} }, { password: null })).toEqual({ obs: { url: 'ws://a:1' }, twitchat: {} });
    expect(applyObsPatch({ obs: { url: 'ws://a:1', password: 'p' }, twitchat: {} }, { url: null })).toEqual({ obs: { password: 'p' }, twitchat: {} });
  });

  test('ne modifie pas le fichier reçu', () => {
    const file = { obs: { password: 'p' }, twitchat: {} };
    applyObsPatch(file, { password: null });
    expect(file).toEqual({ obs: { password: 'p' }, twitchat: {} });
  });

  test('garde le jeton de Twitchat', () => {
    expect(applyObsPatch({ obs: {}, twitchat: { token: 'a'.repeat(48) } }, { password: 'p' }).twitchat.token).toBe('a'.repeat(48));
  });
});

describe('resolveObs', () => {
  test('la saisie du Studio l’emporte sur l’environnement', () => {
    const resolved = resolveObs({ file: { twitchat: {}, obs: { url: 'ws://studio:1', password: 'studio' } }, env: { OBS_WS_URL: 'ws://env:2', OBS_WS_PASSWORD: 'env' } });
    expect(resolved).toEqual({ url: 'ws://studio:1', password: 'studio', source: 'settings' });
  });

  test('sans saisie, l’environnement reste lu (une installation existante continue de marcher)', () => {
    expect(resolveObs({ file: { twitchat: {}, obs: {} }, env: { OBS_WS_URL: 'ws://env:2', OBS_WS_PASSWORD: 'env' } })).toEqual({ url: 'ws://env:2', password: 'env', source: 'env' });
  });

  test('sans rien : adresse par défaut, aucun mot de passe', () => {
    expect(resolveObs({ file: { twitchat: {}, obs: {} }, env: {} })).toEqual({ url: DEFAULT_OBS_URL, password: '', source: 'none' });
    expect(resolveObs({ file: { twitchat: {}, obs: {} }, env: { OBS_WS_URL: '', OBS_WS_PASSWORD: '' } })).toEqual({ url: DEFAULT_OBS_URL, password: '', source: 'none' });
  });

  test('l’adresse et le mot de passe se résolvent séparément', () => {
    expect(resolveObs({ file: { twitchat: {}, obs: { url: 'ws://studio:1' } }, env: { OBS_WS_PASSWORD: 'env' } })).toEqual({ url: 'ws://studio:1', password: 'env', source: 'env' });
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

describe('jeton de Twitchat', () => {
  test('newTwitchatToken : 48 caractères hexadécimaux, tirés du générateur du système', () => {
    expect(newTwitchatToken()).toMatch(/^[0-9a-f]{48}$/);
    expect(newTwitchatToken()).not.toBe(newTwitchatToken());
  });

  test('newTwitchatToken : un octet donne deux chiffres, zéros compris', () => {
    expect(newTwitchatToken((bytes) => bytes.fill(0x0a))).toBe('0a'.repeat(24));
    expect(newTwitchatToken((bytes) => bytes.fill(0xff))).toBe('ff'.repeat(24));
  });

  test('withTwitchatToken pose le jeton sans toucher OBS ni le fichier reçu', () => {
    const file = { obs: { password: 'p' }, twitchat: {} };
    const next = withTwitchatToken(file, 'b'.repeat(48));
    expect(next).toEqual({ obs: { password: 'p' }, twitchat: { token: 'b'.repeat(48) } });
    expect(file.twitchat).toEqual({});
  });

  test('twitchatAddress : l’hôte et le port seuls, et l’adresse complète avec son jeton', () => {
    expect(twitchatAddress({ statePort: 5932, token: 'abc' })).toEqual({ base: 'ws://127.0.0.1:5932', withToken: 'ws://127.0.0.1:5932/twitchat-ws?token=abc' });
  });
});
