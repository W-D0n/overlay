import { describe, expect, test } from 'bun:test';
import { createStudioSettingsSync } from './studio-settings-sync.js';

const COMMAND = { id: 'custom.a', name: 'A', steps: ['edit.copy'] };

function manualTimers() {
  const scheduled = [];
  return {
    setTimeoutImpl: (fn, ms) => { const t = { fn, ms, cleared: false }; scheduled.push(t); return t; },
    clearTimeoutImpl: (t) => { if (t) t.cleared = true; },
    fire: async () => { for (const t of scheduled.splice(0)) if (!t.cleared) await t.fn(); },
    pending: () => scheduled.filter((t) => !t.cleared).length,
  };
}

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), data };
}

function setup({ remote = { customCommands: [], preferences: {} }, storage = fakeStorage(), readFails = null, saveFails = false } = {}) {
  const timers = manualTimers();
  const saved = [];
  const errors = [];
  const client = {
    readStudioSettings: async () => { if (readFails) throw new Error(readFails); return structuredClone(remote); },
    saveStudioSettings: async (patch) => { if (saveFails) throw new Error('réseau'); saved.push(patch); },
  };
  const sync = createStudioSettingsSync({ client, storage, onError: (m) => errors.push(m), ...timers });
  return { sync, saved, errors, timers, storage, setSaveFails: (value) => { saveFails = value; } };
}

describe('chargement', () => {
  test('le serveur est la référence : ses réglages sont ceux de l’interface', async () => {
    const { sync } = setup({ remote: { customCommands: [COMMAND], preferences: { 'view.grid': true } } });
    expect(await sync.load()).toBe('server');
    expect(sync.getCommands()).toEqual([COMMAND]);
    expect(sync.getPreference('view.grid', false)).toBe(true);
    expect(sync.status()).toBe('synced');
  });

  test('une préférence absente ou d’un autre type rend la valeur par défaut', async () => {
    const { sync } = setup({ remote: { customCommands: [], preferences: { 'placement.unit': 3 } } });
    await sync.load();
    expect(sync.getPreference('view.grid', false)).toBe(false);
    expect(sync.getPreference('placement.unit', 'percent')).toBe('percent');
  });

  test('un serveur vide et un navigateur qui a des réglages d’avant : la reprise les envoie une fois', async () => {
    const storage = fakeStorage({
      'overlay.studio.custom-commands': JSON.stringify([COMMAND]),
      'overlay.studio.view-aids': JSON.stringify({ snap: false, grid: true, rulers: false, safe: true }),
      'overlay.studio.placement-unit': 'pixel',
    });
    const { sync, saved } = setup({ storage });
    expect(await sync.load()).toBe('migrated');
    expect(saved).toEqual([{ customCommands: [COMMAND], preferences: { 'view.snap': false, 'view.grid': true, 'view.rulers': false, 'view.safe': true, 'placement.unit': 'pixel' } }]);
    expect(sync.getCommands()).toEqual([COMMAND]);
    expect(sync.getPreference('placement.unit', 'percent')).toBe('pixel');
  });

  test('un serveur qui a déjà des réglages n’est jamais écrasé par ceux du navigateur', async () => {
    const storage = fakeStorage({ 'overlay.studio.custom-commands': JSON.stringify([COMMAND]) });
    const { sync, saved } = setup({ remote: { customCommands: [], preferences: { a: 1 } }, storage });
    expect(await sync.load()).toBe('server');
    expect(saved).toEqual([]);
    expect(sync.getCommands()).toEqual([]);
  });

  test('un contenu d’avant illisible ou invalide n’est jamais envoyé', async () => {
    const storage = fakeStorage({ 'overlay.studio.custom-commands': '{pas du json', 'overlay.studio.view-aids': '3' });
    const { sync, saved } = setup({ storage });
    expect(await sync.load()).toBe('server');
    expect(saved).toEqual([]);
    const bad = fakeStorage({ 'overlay.studio.custom-commands': JSON.stringify([{ id: 'pas-custom', name: 'x', steps: ['a'] }]) });
    const second = setup({ storage: bad });
    expect(await second.sync.load()).toBe('server');
    expect(second.saved).toEqual([]);
  });

  test('serveur injoignable : on travaille sur le cache, hors ligne, et on le dit', async () => {
    const storage = fakeStorage({ 'overlay.studio.settings-cache': JSON.stringify({ customCommands: [COMMAND], preferences: { a: 1 } }) });
    const { sync, errors } = setup({ storage, readFails: 'serveur trop ancien' });
    expect(await sync.load()).toBe('cache');
    expect(sync.getCommands()).toEqual([COMMAND]);
    expect(sync.status()).toBe('offline');
    expect(errors[0]).toContain('trop ancien');
  });
});

describe('enregistrement', () => {
  test('les changements rapprochés partent en un seul envoi, au délai', async () => {
    const { sync, saved, timers } = setup();
    await sync.load();
    sync.setPreference('view.grid', true);
    sync.setPreference('view.rulers', true);
    sync.setPreference('view.grid', false);
    sync.setCommands([COMMAND]);
    expect(saved).toEqual([]);
    expect(timers.pending()).toBe(1);
    await timers.fire();
    expect(saved).toEqual([{ customCommands: [COMMAND], preferences: { 'view.grid': false, 'view.rulers': true } }]);
    expect(sync.status()).toBe('synced');
  });

  test('une préférence inchangée n’envoie rien', async () => {
    const { sync, saved, timers } = setup({ remote: { customCommands: [], preferences: { a: 1 } } });
    await sync.load();
    sync.setPreference('a', 1);
    expect(timers.pending()).toBe(0);
    expect(saved).toEqual([]);
  });

  test('un envoi qui échoue ne perd rien : hors ligne, signalé, retenté, puis rattrapé', async () => {
    const { sync, saved, errors, timers, setSaveFails } = setup();
    await sync.load();
    setSaveFails(true);
    sync.setPreference('view.grid', true);
    await timers.fire();
    expect(sync.status()).toBe('offline');
    expect(errors.at(-1)).toContain('non enregistrés');
    expect(sync.hasPending()).toBe(true);
    sync.setPreference('view.rulers', true);
    setSaveFails(false);
    await timers.fire();
    expect(saved).toEqual([{ preferences: { 'view.grid': true, 'view.rulers': true } }]);
    expect(sync.status()).toBe('synced');
    expect(sync.hasPending()).toBe(false);
  });

  test('flush envoie sans attendre le délai (avant de quitter la page)', async () => {
    const { sync, saved } = setup();
    await sync.load();
    sync.setCommands([COMMAND]);
    await sync.flush();
    expect(saved).toHaveLength(1);
  });

  test('le cache du navigateur suit chaque changement', async () => {
    const { sync, storage } = setup();
    await sync.load();
    sync.setPreference('view.grid', true);
    expect(JSON.parse(storage.data.get('overlay.studio.settings-cache')).preferences['view.grid']).toBe(true);
  });

  test('un stockage qui lève ne casse rien', async () => {
    const hostile = { getItem() { throw new Error('refusé'); }, setItem() { throw new Error('plein'); } };
    const { sync } = setup({ storage: hostile });
    expect(await sync.load()).toBe('server');
    sync.setPreference('a', 1);
    expect(sync.getPreference('a', 0)).toBe(1);
  });
});

describe('mises à jour distantes', () => {
  test('les réglages d’un autre onglet remplacent les nôtres et préviennent', async () => {
    const { sync } = setup();
    await sync.load();
    let notified = 0;
    sync.subscribe(() => { notified += 1; });
    sync.applyRemote({ customCommands: [COMMAND], preferences: { 'view.grid': true } });
    expect(sync.getCommands()).toEqual([COMMAND]);
    expect(sync.getPreference('view.grid', false)).toBe(true);
    expect(notified).toBeGreaterThan(0);
  });

  test('ce qui n’est pas encore parti n’est pas écrasé par un message distant', async () => {
    const { sync } = setup();
    await sync.load();
    sync.setPreference('view.grid', true);
    sync.setCommands([COMMAND]);
    sync.applyRemote({ customCommands: [], preferences: { 'view.grid': false, 'view.rulers': true } });
    expect(sync.getCommands()).toEqual([COMMAND]);
    expect(sync.getPreference('view.grid', false)).toBe(true);
    expect(sync.getPreference('view.rulers', false)).toBe(true);
  });

  test('un message invalide est ignoré ; un message identique ne prévient pas', async () => {
    const { sync } = setup({ remote: { customCommands: [], preferences: { a: 1 } } });
    await sync.load();
    let notified = 0;
    sync.subscribe(() => { notified += 1; });
    sync.applyRemote({ customCommands: 'non' });
    sync.applyRemote({ customCommands: [], preferences: { a: 1 } });
    expect(notified).toBe(0);
  });
});
