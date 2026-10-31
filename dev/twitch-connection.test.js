import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChannels } from './channels.js';
import { createConnectionStore } from './connection-store.js';
import { createEventIntake } from './event-intake.js';
import { createTwitchConnection } from './twitch-connection.js';
import { TWITCH_SCOPES } from './twitch-auth.js';
import { withTwitch } from './connection-settings.js';

const CLIENT_ID = 'abcdefghij0123456789abcdefghij';
const HOUR = 3_600_000;
/** @type {string[]} */
const directories = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

const tokens = (name, expiresAt) => ({ accessToken: name, refreshToken: `r-${name}`, expiresAt, scopes: [...TWITCH_SCOPES] });

/** Un Twitch scripté, un magasin réel dans un dossier jetable, une horloge et une session de façade. */
function setup(script = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-twitch-connection-'));
  directories.push(directory);
  const path = join(directory, 'state.json.connections.json');
  const store = createConnectionStore({ path });
  let time = 10_000_000;
  const now = () => time;
  const sleeps = [];
  const timers = [];
  const warnings = [];
  const channels = createChannels();
  const broadcast = [];
  channels.add({ data: { channel: 'event', role: 'render' }, send: (payload) => broadcast.push(JSON.parse(payload)) });
  const intake = createEventIntake({ channels, now, ...(script.intake ?? {}) });
  const calls = { start: [], exchange: [], refresh: [], validate: [], revoke: [] };
  const exchanges = [...(script.exchanges ?? [])];
  const refreshes = [...(script.refreshes ?? [])];
  const auth = {
    startDeviceFlow: async (input) => { calls.start.push(input); return script.start ?? { ok: true, device: { deviceCode: 'dc', userCode: 'USER-CODE', verificationUri: 'https://twitch.test/activate', expiresInSeconds: 1800, intervalSeconds: 5 } }; },
    exchangeDeviceCode: async (input) => { calls.exchange.push(input); return exchanges.shift() ?? { status: 'pending' }; },
    refresh: async (input) => { calls.refresh.push(input); await Promise.resolve(); return refreshes.shift() ?? { ok: true, tokens: tokens('renewed', time + 4 * HOUR) }; },
    validate: async (token) => { calls.validate.push(token); return script.validate ?? { ok: true, userId: '42', login: 'mozaik', scopes: [...TWITCH_SCOPES], clientId: CLIENT_ID }; },
    revoke: async (input) => { calls.revoke.push(input); return true; },
  };
  const sessions = [];
  const connection = createTwitchConnection({
    store, intake, auth, now,
    // Rend la main à la boucle d'événements : une attente qui ne laisse jamais passer un minuteur la figerait.
    sleep: async (ms) => { sleeps.push(ms); time += script.sleepAdvances ?? 0; await new Promise((resolve) => setTimeout(resolve, 1)); },
    setTimer: (callback, delay) => { const timer = { callback, delay, cleared: false }; timers.push(timer); return timer; },
    clearTimer: (timer) => { timer.cleared = true; },
    // Ce que le fichier contient à l'instant où la session s'ouvre : les jetons neufs doivent déjà y être.
    createSession: (deps) => { const session = { deps, onDisk: JSON.parse(readFileSync(path, 'utf8')).twitch, started: 0, stopped: 0, start() { this.started += 1; }, stop() { this.stopped += 1; }, status: () => ({}) }; sessions.push(session); return session; },
    log: { info() {}, warn: (message) => warnings.push(message) },
  });
  const until = async (condition) => {
    for (let index = 0; index < 400; index += 1) {
      if (condition()) return true;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    return false;
  };
  const stored = async () => (await store.read()).twitch;
  const seed = (changes) => store.update((file) => withTwitch(file, changes));
  return { connection, calls, sessions, sleeps, timers, warnings, until, stored, seed, store, path, intake, broadcast, advance: (ms) => { time += ms; }, clock: () => time, exchanges, refreshes };
}

const loggedIn = (time, expiresIn = 4 * HOUR) => ({ clientId: CLIENT_ID, accessToken: 'at', refreshToken: 'rt', expiresAt: time + expiresIn, userId: '42', login: 'mozaik', scopes: [...TWITCH_SCOPES] });

describe('identifiant client', () => {
  test('un identifiant invalide est refusé avec la raison, rien n’est écrit', async () => {
    const { connection, stored } = setup();
    expect((await connection.setClientId('pas valide!')).ok).toBe(false);
    expect((await connection.setClientId('')).ok).toBe(false);
    expect((await stored()).clientId).toBeUndefined();
  });

  test('un identifiant valide est gardé (espaces retirés)', async () => {
    const { connection, stored } = setup();
    expect(await connection.setClientId(`  ${CLIENT_ID}  `)).toEqual({ ok: true });
    expect((await stored()).clientId).toBe(CLIENT_ID);
    expect(connection.view().clientId).toBe(CLIENT_ID);
  });

  test('changer d’application déconnecte : les jetons de l’ancienne ne valent rien pour la nouvelle', async () => {
    const { connection, seed, stored, calls, clock } = setup();
    await seed(loggedIn(clock()));
    await connection.init();
    await connection.setClientId('zzzzzzzzzz0123456789zzzzzzzzzz');
    const after = await stored();
    expect(after.accessToken).toBeUndefined();
    expect(after.clientId).toBe('zzzzzzzzzz0123456789zzzzzzzzzz');
    expect(calls.revoke).toHaveLength(1);
  });
});

describe('connexion par code d’appareil', () => {
  test('sans identifiant client : refusé en le disant', async () => {
    const { connection } = setup();
    const result = await connection.startLogin();
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('identifiant client');
  });

  test('donne le code et l’adresse à ouvrir, puis attend', async () => {
    const { connection, calls } = setup();
    await connection.setClientId(CLIENT_ID);
    expect(await connection.startLogin()).toEqual({ ok: true });
    expect(calls.start).toEqual([{ clientId: CLIENT_ID }]);
    expect(connection.view()).toMatchObject({ phase: 'login', userCode: 'USER-CODE', verificationUri: 'https://twitch.test/activate' });
    connection.stop();
  });

  test('parcours complet : attente, autorisation, compte vérifié, jetons gardés, session ouverte', async () => {
    const { connection, calls, sessions, stored, until, sleeps, exchanges, clock } = setup();
    exchanges.push({ status: 'pending' }, { status: 'pending' }, { status: 'ok', tokens: tokens('first', clock() + 4 * HOUR) });
    await connection.setClientId(CLIENT_ID);
    await connection.startLogin();
    expect(await until(() => sessions.length === 1)).toBe(true);
    expect(sleeps).toEqual([5000, 5000, 5000]);
    expect(calls.exchange.every((call) => call.clientId === CLIENT_ID && call.deviceCode === 'dc')).toBe(true);
    expect(calls.validate).toEqual(['first']);
    expect(await stored()).toMatchObject({ clientId: CLIENT_ID, accessToken: 'first', refreshToken: 'r-first', userId: '42', login: 'mozaik' });
    expect(sessions[0].started).toBe(1);
    expect(sessions[0].deps).toMatchObject({ userId: '42', clientId: CLIENT_ID });
    expect(sessions[0].deps.getAccessToken()).toBe('first');
    expect(connection.view()).toMatchObject({ loggedIn: true, login: 'mozaik', userCode: null, verificationUri: null, phase: 'connecting' });
    connection.stop();
  });

  test('« slow_down » rallonge l’intervalle de 5 s', async () => {
    const { connection, sleeps, exchanges, until, sessions, clock } = setup();
    exchanges.push({ status: 'slow' }, { status: 'pending' }, { status: 'ok', tokens: tokens('t', clock() + HOUR) });
    await connection.setClientId(CLIENT_ID);
    await connection.startLogin();
    await until(() => sessions.length === 1);
    expect(sleeps).toEqual([5000, 10000, 10000]);
    connection.stop();
  });

  test('un code expiré : erreur, et le Studio demande de recommencer', async () => {
    const { connection, until } = setup({ sleepAdvances: 2_000_000 });
    await connection.setClientId(CLIENT_ID);
    await connection.startLogin();
    expect(await until(() => connection.view().phase === 'error')).toBe(true);
    expect(connection.view().detail).toContain('expiré');
    expect(connection.view()).toMatchObject({ userCode: null, needsLogin: true });
  });

  test('un refus de Twitch pendant l’attente est dit', async () => {
    const { connection, until, exchanges } = setup();
    exchanges.push({ status: 'error', error: 'l’autorisation a été refusée sur Twitch' });
    await connection.setClientId(CLIENT_ID);
    await connection.startLogin();
    await until(() => connection.view().phase === 'error');
    expect(connection.view().detail).toContain('refusée');
  });

  test('une demande de code refusée par Twitch : erreur dite, rien n’attend', async () => {
    const { connection, calls } = setup({ start: { ok: false, error: 'Twitch refuse la demande : invalid client' } });
    await connection.setClientId(CLIENT_ID);
    const result = await connection.startLogin();
    expect(result.ok).toBe(false);
    expect(connection.view()).toMatchObject({ phase: 'error', detail: 'Twitch refuse la demande : invalid client' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls.exchange).toHaveLength(0);
  });

  test('des portées incomplètes sont refusées avec la liste de ce qui manque, aucun jeton n’est gardé', async () => {
    const { connection, until, exchanges, stored, sessions, clock } = setup({ validate: { ok: true, userId: '42', login: 'm', scopes: ['bits:read'], clientId: CLIENT_ID } });
    exchanges.push({ status: 'ok', tokens: tokens('t', clock() + HOUR) });
    await connection.setClientId(CLIENT_ID);
    await connection.startLogin();
    await until(() => connection.view().phase === 'error');
    expect(connection.view().detail).toContain('moderator:read:followers');
    expect(connection.view().detail).toContain('channel:read:subscriptions');
    expect(connection.view().detail).not.toContain('bits:read,');
    expect((await stored()).accessToken).toBeUndefined();
    expect(sessions).toHaveLength(0);
  });

  test('une autorisation d’une autre application est refusée', async () => {
    const { connection, until, exchanges, stored, clock } = setup({ validate: { ok: true, userId: '42', login: 'm', scopes: [...TWITCH_SCOPES], clientId: 'autre-application-1234567890' } });
    exchanges.push({ status: 'ok', tokens: tokens('t', clock() + HOUR) });
    await connection.setClientId(CLIENT_ID);
    await connection.startLogin();
    await until(() => connection.view().phase === 'error');
    expect(connection.view().detail).toContain('autre application');
    expect((await stored()).accessToken).toBeUndefined();
  });

  test('un jeton refusé à la vérification : erreur dite, rien de gardé', async () => {
    const { connection, until, exchanges, stored, clock } = setup({ validate: { ok: false, error: 'jeton refusé par Twitch : invalid access token', rejected: true } });
    exchanges.push({ status: 'ok', tokens: tokens('t', clock() + HOUR) });
    await connection.setClientId(CLIENT_ID);
    await connection.startLogin();
    await until(() => connection.view().phase === 'error');
    expect(connection.view().detail).toContain('invalid access token');
    expect((await stored()).accessToken).toBeUndefined();
  });

  test('annuler arrête l’attente : plus aucun essai d’échange', async () => {
    const { connection, calls, sleeps } = setup();
    await connection.setClientId(CLIENT_ID);
    await connection.startLogin();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await connection.cancelLogin();
    const exchangesAtCancel = calls.exchange.length;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls.exchange.length).toBe(exchangesAtCancel);
    expect(connection.view()).toMatchObject({ phase: 'logged-out', userCode: null });
    expect(sleeps.length).toBeGreaterThan(0);
  });

  test('recommencer remplace l’attente précédente : seul le dernier code est interrogé', async () => {
    const { connection, calls, exchanges } = setup();
    await connection.setClientId(CLIENT_ID);
    await connection.startLogin();
    await connection.startLogin();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls.start).toHaveLength(2);
    connection.stop();
    const before = calls.exchange.length;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls.exchange.length).toBe(before);
    expect(exchanges).toHaveLength(0);
  });

  test('annuler en étant déjà connecté rouvre la session', async () => {
    const { connection, seed, sessions, clock } = setup();
    await seed(loggedIn(clock()));
    await connection.init();
    await connection.startLogin();
    expect(sessions[0].stopped).toBe(1);
    await connection.cancelLogin();
    expect(sessions).toHaveLength(2);
    expect(sessions[1].started).toBe(1);
    connection.stop();
  });
});

describe('démarrage', () => {
  test('rien d’enregistré : rien ne s’ouvre', async () => {
    const { connection, sessions } = setup();
    await connection.init();
    expect(sessions).toHaveLength(0);
    expect(connection.view()).toMatchObject({ phase: 'logged-out', loggedIn: false });
  });

  test('déjà connecté : la session se rouvre seule, sans rafraîchir un jeton encore bon', async () => {
    const { connection, seed, sessions, calls, clock } = setup();
    await seed(loggedIn(clock()));
    await connection.init();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].started).toBe(1);
    expect(calls.refresh).toHaveLength(0);
    expect(connection.view()).toMatchObject({ phase: 'connecting', loggedIn: true, login: 'mozaik' });
    connection.stop();
  });

  test('un jeton proche de l’échéance est rafraîchi AVANT d’ouvrir la session, et le neuf est déjà écrit', async () => {
    const { connection, seed, sessions, calls, stored, clock } = setup();
    await seed(loggedIn(clock(), 60_000));
    await connection.init();
    expect(calls.refresh).toEqual([{ clientId: CLIENT_ID, refreshToken: 'rt' }]);
    expect((await stored()).accessToken).toBe('renewed');
    expect(sessions[0].deps.getAccessToken()).toBe('renewed');
    expect(sessions[0].onDisk).toMatchObject({ accessToken: 'renewed', refreshToken: 'r-renewed' });
    connection.stop();
  });

  test('un jeton de rafraîchissement refusé : jetons effacés, reconnexion demandée, aucune session', async () => {
    const { connection, seed, sessions, stored, refreshes, clock } = setup();
    refreshes.push({ ok: false, error: 'Twitch refuse le rafraîchissement : Invalid refresh token', rejected: true });
    await seed(loggedIn(clock(), 1000));
    await connection.init();
    expect(sessions).toHaveLength(0);
    expect(connection.view()).toMatchObject({ phase: 'error', needsLogin: true, loggedIn: false });
    expect(connection.view().detail).toContain('reconnectez Twitch');
    const after = await stored();
    expect(after.accessToken).toBeUndefined();
    expect(after.refreshToken).toBeUndefined();
    expect(after.clientId).toBe(CLIENT_ID);
  });

  test('un incident réseau au rafraîchissement : on garde les jetons, sans demander de se reconnecter', async () => {
    const { connection, seed, sessions, stored, refreshes, clock } = setup();
    refreshes.push({ ok: false, error: 'Twitch injoignable : coupé', rejected: false });
    await seed(loggedIn(clock(), 1000));
    await connection.init();
    expect(sessions).toHaveLength(0);
    expect(connection.view()).toMatchObject({ phase: 'error', needsLogin: false });
    expect((await stored()).refreshToken).toBe('rt');
  });

  test('un fichier de réglages illisible ne fait pas planter le démarrage', async () => {
    const { connection, path } = setup();
    writeFileSync(path, '{ cassé');
    await connection.init();
    expect(connection.view().phase).toBe('logged-out');
  });
});

describe('jetons', () => {
  test('deux rafraîchissements simultanés n’en font qu’un (le jeton ne sert qu’une fois)', async () => {
    const { connection, seed, sessions, calls, clock } = setup();
    await seed(loggedIn(clock()));
    await connection.init();
    const refresh = sessions[0].deps.refreshAccessToken;
    const [first, second] = await Promise.all([refresh(), refresh()]);
    expect(first && second).toBe(true);
    expect(calls.refresh).toHaveLength(1);
    connection.stop();
  });

  test('le rafraîchissement écrit les jetons neufs et la session les lit', async () => {
    const { connection, seed, sessions, stored, clock } = setup();
    await seed(loggedIn(clock()));
    await connection.init();
    expect(sessions[0].deps.getAccessToken()).toBe('at');
    await sessions[0].deps.refreshAccessToken();
    expect(sessions[0].deps.getAccessToken()).toBe('renewed');
    expect(await stored()).toMatchObject({ accessToken: 'renewed', refreshToken: 'r-renewed', userId: '42' });
    connection.stop();
  });

  test('un rafraîchissement refusé en cours de route coupe la session et demande de se reconnecter', async () => {
    const { connection, seed, sessions, refreshes, clock } = setup();
    refreshes.push({ ok: false, error: 'refusé', rejected: true });
    await seed(loggedIn(clock()));
    await connection.init();
    expect(await sessions[0].deps.refreshAccessToken()).toBe(false);
    expect(sessions[0].stopped).toBeGreaterThan(0);
    expect(connection.view()).toMatchObject({ phase: 'error', needsLogin: true, loggedIn: false });
  });

  test('le rafraîchissement est programmé 5 minutes avant l’échéance, puis reprogrammé après chaque succès', async () => {
    const { connection, seed, timers, sessions, clock } = setup();
    await seed(loggedIn(clock(), 4 * HOUR));
    await connection.init();
    const first = timers.filter((timer) => !timer.cleared).at(-1);
    expect(first.delay).toBe(4 * HOUR - 5 * 60_000);
    await sessions[0].deps.refreshAccessToken();
    const live = timers.filter((timer) => !timer.cleared);
    expect(live).toHaveLength(1);
    expect(live[0].delay).toBe(4 * HOUR - 5 * 60_000);
    connection.stop();
  });

  test('l’échéance programmée lance bien un rafraîchissement', async () => {
    const { connection, seed, timers, calls, clock } = setup();
    await seed(loggedIn(clock()));
    await connection.init();
    timers.filter((timer) => !timer.cleared).at(-1).callback();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(calls.refresh).toHaveLength(1);
    connection.stop();
  });
});

describe('état de la session et alertes', () => {
  test('l’état de la session EventSub se reflète dans la vue', async () => {
    const { connection, seed, sessions, clock } = setup();
    await seed(loggedIn(clock()));
    await connection.init();
    sessions[0].deps.onStatus({ state: 'connected', detail: null, subscriptions: 6, needsLogin: false });
    expect(connection.view()).toMatchObject({ phase: 'connected', subscriptions: 6 });
    sessions[0].deps.onStatus({ state: 'reconnecting', detail: 'coupé', subscriptions: 0, needsLogin: false });
    expect(connection.view()).toMatchObject({ phase: 'reconnecting', detail: 'coupé' });
    connection.stop();
  });

  test('une erreur d’autorisation de la session coupe aussi le rafraîchissement programmé', async () => {
    const { connection, seed, sessions, timers, clock } = setup();
    await seed(loggedIn(clock()));
    await connection.init();
    sessions[0].deps.onStatus({ state: 'error', detail: 'reconnectez Twitch', subscriptions: 0, needsLogin: true });
    expect(connection.view()).toMatchObject({ phase: 'error', needsLogin: true });
    expect(timers.filter((timer) => !timer.cleared)).toEqual([]);
  });

  test('une alerte de Twitch est publiée avec la source « twitch » et datée', async () => {
    const { connection, seed, sessions, intake, broadcast, clock } = setup();
    await seed(loggedIn(clock()));
    await connection.init();
    sessions[0].deps.onAlert({ type: 'raid', username: 'Boss', amount: 30 });
    expect(broadcast).toEqual([{ type: 'raid', username: 'Boss', amount: 30 }]);
    expect(intake.recent()[0]).toMatchObject({ source: 'twitch', type: 'raid' });
    expect(connection.view().lastAlertAt).not.toBeNull();
    connection.stop();
  });

  test('le limiteur de rafales s’applique aussi à Twitch (rafale d’abonnements offerts)', async () => {
    const { connection, seed, sessions, broadcast, warnings, clock } = setup({ intake: { burst: 2 } });
    await seed(loggedIn(clock()));
    await connection.init();
    for (let index = 0; index < 4; index += 1) sessions[0].deps.onAlert({ type: 'sub', username: `u${index}` });
    expect(broadcast).toHaveLength(2);
    expect(warnings.filter((message) => message.includes('trop d’alertes'))).toHaveLength(2);
    connection.stop();
  });
});

describe('déconnexion', () => {
  test('coupe la session, révoque le jeton chez Twitch, efface les jetons et garde l’identifiant client', async () => {
    const { connection, seed, sessions, calls, stored, clock } = setup();
    await seed(loggedIn(clock()));
    await connection.init();
    await connection.logout();
    expect(sessions[0].stopped).toBeGreaterThan(0);
    expect(calls.revoke).toEqual([{ clientId: CLIENT_ID, token: 'at' }]);
    const after = await stored();
    expect(after).toEqual({ clientId: CLIENT_ID });
    expect(connection.view()).toMatchObject({ phase: 'logged-out', loggedIn: false, login: null, scopes: [] });
  });

  test('déconnecté, il n’y a rien à révoquer', async () => {
    const { connection, calls } = setup();
    await connection.logout();
    expect(calls.revoke).toEqual([]);
  });
});

describe('secrets', () => {
  test('la vue ne porte jamais un jeton, ni le jeton de rafraîchissement', async () => {
    const { connection, seed, clock } = setup();
    await seed({ ...loggedIn(clock()), accessToken: 'SECRET-ACCES', refreshToken: 'SECRET-REFRESH' });
    await connection.init();
    const text = JSON.stringify(connection.view());
    expect(text).not.toContain('SECRET-ACCES');
    expect(text).not.toContain('SECRET-REFRESH');
    expect(connection.view()).toMatchObject({ clientId: CLIENT_ID, login: 'mozaik', loggedIn: true });
    connection.stop();
  });
});
