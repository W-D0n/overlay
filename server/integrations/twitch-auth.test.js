import { describe, expect, test } from 'bun:test';
import { DEVICE_GRANT, TWITCH_SCOPES, createTwitchAuth } from './twitch-auth.js';

/** Un faux réseau : il note les requêtes et rend les réponses scriptées, dans l'ordre. */
function network(...responses) {
  const calls = [];
  const queue = [...responses];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body === undefined ? null : Object.fromEntries(new URLSearchParams(String(init.body))) });
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return new Response(next.body === undefined ? '' : JSON.stringify(next.body), { status: next.status });
  };
  return { fetchImpl, calls };
}

const NOW = 1_000_000;
const auth = (net, options = {}) => createTwitchAuth({ idUrl: 'https://id.test', fetchImpl: net.fetchImpl, now: () => NOW, ...options });

describe('startDeviceFlow', () => {
  test('demande le code avec l’identifiant client et les portées séparées par des espaces', async () => {
    const net = network({ status: 200, body: { device_code: 'dc', user_code: 'ABCDEFGH', verification_uri: 'https://www.twitch.tv/activate?device-code=ABCDEFGH', expires_in: 1800, interval: 5 } });
    const result = await auth(net).startDeviceFlow({ clientId: 'cid' });
    expect(net.calls[0].url).toBe('https://id.test/oauth2/device');
    expect(net.calls[0].method).toBe('POST');
    expect(net.calls[0].headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(net.calls[0].body).toEqual({ client_id: 'cid', scopes: TWITCH_SCOPES.join(' ') });
    expect(result).toEqual({ ok: true, device: { deviceCode: 'dc', userCode: 'ABCDEFGH', verificationUri: 'https://www.twitch.tv/activate?device-code=ABCDEFGH', expiresInSeconds: 1800, intervalSeconds: 5 } });
  });

  test('l’intervalle manquant ou absurde devient 5 s, la durée 30 min', async () => {
    const net = network({ status: 200, body: { device_code: 'd', user_code: 'u', verification_uri: 'v', interval: 0 } });
    const result = await auth(net).startDeviceFlow({ clientId: 'cid' });
    expect(result.ok && result.device).toMatchObject({ intervalSeconds: 5, expiresInSeconds: 1800 });
  });

  test('un refus de Twitch est dit avec sa raison et le conseil sur le type d’application', async () => {
    const result = await auth(network({ status: 400, body: { status: 400, message: 'invalid client' } })).startDeviceFlow({ clientId: 'faux' });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('invalid client');
    expect(result.ok === false && result.error).toContain('Public');
  });

  test('une réponse incomplète est refusée', async () => {
    expect((await auth(network({ status: 200, body: { device_code: 'd' } })).startDeviceFlow({ clientId: 'c' })).ok).toBe(false);
  });

  test('Twitch injoignable : dit, sans lever', async () => {
    const result = await auth(network(new Error('réseau coupé'))).startDeviceFlow({ clientId: 'c' });
    expect(result).toEqual({ ok: false, error: 'Twitch injoignable : réseau coupé' });
  });
});

describe('exchangeDeviceCode', () => {
  const exchange = (net) => auth(net).exchangeDeviceCode({ clientId: 'cid', deviceCode: 'dc' });

  test('envoie le type d’octroi exact de Twitch et le code de l’appareil', async () => {
    const net = network({ status: 400, body: { status: 400, message: 'authorization_pending' } });
    await exchange(net);
    expect(net.calls[0].url).toBe('https://id.test/oauth2/token');
    expect(net.calls[0].body).toEqual({ client_id: 'cid', scopes: TWITCH_SCOPES.join(' '), device_code: 'dc', grant_type: DEVICE_GRANT });
    expect(DEVICE_GRANT).toBe('urn:ietf:params:oauth:grant-type:device_code');
  });

  test('« authorization_pending » : on attend', async () => {
    expect(await exchange(network({ status: 400, body: { message: 'authorization_pending' } }))).toEqual({ status: 'pending' });
  });

  test('« slow_down » : on ralentit', async () => {
    expect(await exchange(network({ status: 400, body: { message: 'slow_down' } }))).toEqual({ status: 'slow' });
  });

  test('code expiré, autorisation refusée, autre refus : dits en clair', async () => {
    expect((await exchange(network({ status: 400, body: { message: 'expired_token' } }))).error).toContain('expiré');
    expect((await exchange(network({ status: 400, body: { message: 'access_denied' } }))).error).toContain('refusée');
    expect((await exchange(network({ status: 400, body: { message: 'invalid device code' } }))).error).toContain('invalid device code');
  });

  test('succès : les jetons, l’échéance calculée sur l’horloge, les portées (tableau ou texte)', async () => {
    const asArray = await exchange(network({ status: 200, body: { access_token: 'at', refresh_token: 'rt', expires_in: 14400, scope: ['bits:read', 'x'], token_type: 'bearer' } }));
    expect(asArray).toEqual({ status: 'ok', tokens: { accessToken: 'at', refreshToken: 'rt', expiresAt: NOW + 14_400_000, scopes: ['bits:read', 'x'] } });
    const asText = await exchange(network({ status: 200, body: { access_token: 'at', refresh_token: 'rt', expires_in: 60, scope: 'bits:read x' } }));
    expect(asText.tokens.scopes).toEqual(['bits:read', 'x']);
  });

  test('un succès sans jeton de rafraîchissement est une erreur', async () => {
    expect((await exchange(network({ status: 200, body: { access_token: 'at', expires_in: 1 } }))).status).toBe('error');
  });

  test('Twitch injoignable', async () => {
    expect((await exchange(network(new Error('coupé')))).error).toContain('injoignable');
  });
});

describe('refresh', () => {
  const refresh = (net) => auth(net).refresh({ clientId: 'cid', refreshToken: 'rt/avec+caractères' });

  test('demande un jeton neuf sans secret client (application publique)', async () => {
    const net = network({ status: 200, body: { access_token: 'at2', refresh_token: 'rt2', expires_in: 14400, scope: ['bits:read'] } });
    const result = await refresh(net);
    expect(net.calls[0].body).toEqual({ client_id: 'cid', grant_type: 'refresh_token', refresh_token: 'rt/avec+caractères' });
    expect(Object.keys(net.calls[0].body)).not.toContain('client_secret');
    expect(result).toEqual({ ok: true, tokens: { accessToken: 'at2', refreshToken: 'rt2', expiresAt: NOW + 14_400_000, scopes: ['bits:read'] } });
  });

  test('400 et 401 : le jeton ne vaut plus rien (il faudra se reconnecter)', async () => {
    expect(await refresh(network({ status: 400, body: { message: 'Invalid refresh token' } }))).toMatchObject({ ok: false, rejected: true });
    expect(await refresh(network({ status: 401, body: {} }))).toMatchObject({ ok: false, rejected: true });
  });

  test('500 ou réseau coupé : un incident passager, le jeton n’est pas jugé mort', async () => {
    expect(await refresh(network({ status: 500, body: {} }))).toMatchObject({ ok: false, rejected: false });
    expect(await refresh(network(new Error('coupé')))).toMatchObject({ ok: false, rejected: false });
  });
});

describe('validate', () => {
  test('lit le compte et les portées, avec le schéma « OAuth »', async () => {
    const net = network({ status: 200, body: { client_id: 'cid', login: 'mozaik', user_id: '123', scopes: ['bits:read'], expires_in: 100 } });
    const result = await auth(net).validate('at');
    expect(net.calls[0].url).toBe('https://id.test/oauth2/validate');
    expect(net.calls[0].headers.Authorization).toBe('OAuth at');
    expect(result).toEqual({ ok: true, userId: '123', login: 'mozaik', scopes: ['bits:read'], clientId: 'cid' });
  });

  test('401 : jeton refusé, et dit rejeté', async () => {
    expect(await auth(network({ status: 401, body: { status: 401, message: 'invalid access token' } })).validate('x')).toMatchObject({ ok: false, rejected: true });
  });

  test('un jeton d’application (sans compte) ou une réponse incomplète est refusé', async () => {
    expect((await auth(network({ status: 200, body: { client_id: 'c', login: null, user_id: null } })).validate('x')).ok).toBe(false);
  });

  test('réseau coupé : pas jugé rejeté', async () => {
    expect(await auth(network(new Error('coupé'))).validate('x')).toMatchObject({ ok: false, rejected: false });
  });
});

describe('revoke', () => {
  test('poste l’identifiant et le jeton ; vrai sur 200', async () => {
    const net = network({ status: 200 });
    expect(await auth(net).revoke({ clientId: 'cid', token: 'at' })).toBe(true);
    expect(net.calls[0].url).toBe('https://id.test/oauth2/revoke');
    expect(net.calls[0].body).toEqual({ client_id: 'cid', token: 'at' });
  });

  test('faux sinon, sans lever', async () => {
    expect(await auth(network({ status: 400, body: {} })).revoke({ clientId: 'c', token: 't' })).toBe(false);
    expect(await auth(network(new Error('coupé'))).revoke({ clientId: 'c', token: 't' })).toBe(false);
  });
});

test('une adresse de Twitch avec une barre finale est normalisée', async () => {
  const net = network({ status: 200, body: {} });
  await createTwitchAuth({ idUrl: 'https://id.test/', fetchImpl: net.fetchImpl }).revoke({ clientId: 'c', token: 't' });
  expect(net.calls[0].url).toBe('https://id.test/oauth2/revoke');
});
