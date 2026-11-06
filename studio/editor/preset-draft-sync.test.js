import { describe, expect, test } from 'bun:test';
import { createPresetDraftSync } from './preset-draft-sync.js';

/** Horloge manuelle : les délais ne passent que quand le test le dit. */
function manualTimers() {
  const scheduled = [];
  return {
    setTimeoutImpl: (fn, ms) => { const timer = { fn, ms, cleared: false }; scheduled.push(timer); return timer; },
    clearTimeoutImpl: (timer) => { if (timer) timer.cleared = true; },
    fire() { for (const timer of scheduled.splice(0)) if (!timer.cleared) timer.fn(); },
    pendingCount: () => scheduled.filter((timer) => !timer.cleared).length,
  };
}

/** Une scène à un effet (ou sans effet si `kind` est null), comme le document du Studio la détient. */
const sceneOf = (kind, options = {}) => ({
  version: 1, id: 'current', name: 'En antenne',
  layers: kind === null ? [] : [{ id: 'main', kind, visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options }],
});

function setup({ active = 'a', component = 'rain', options = { speed: 1 }, failWith = null } = {}) {
  const session = { activePresetId: active, scene: sceneOf(component, options) };
  const calls = [];
  const errors = [];
  let changes = 0;
  const timers = manualTimers();
  const client = {
    readDrafts: async () => { if (failWith) throw new Error(failWith); return { z: { at: 'T0', scene: sceneOf('bubble') } }; },
    saveDraft: async (presetId, scene) => { calls.push(['save', presetId, scene]); },
    discardDraft: async (presetId) => { calls.push(['discard', presetId]); },
  };
  const sync = createPresetDraftSync({
    client, snapshot: () => session, now: () => 'NOW',
    onChange: () => { changes += 1; }, onError: (message) => errors.push(message), ...timers,
  });
  return { sync, session, calls, errors, timers, changes: () => changes };
}

describe('envoi des réglages', () => {
  test('un réglage est envoyé après le délai, avec la scène complète du preset', async () => {
    const { sync, calls, timers } = setup();
    sync.schedule();
    expect(calls).toEqual([]);
    timers.fire();
    await Promise.resolve();
    expect(calls).toEqual([['save', 'a', sceneOf('rain', { speed: 1 })]]);
    expect(sync.has('a')).toBe(true);
  });

  test('plusieurs réglages rapprochés ne font qu’un envoi, du dernier état', async () => {
    const { sync, session, calls, timers } = setup();
    sync.schedule();
    session.scene = sceneOf('rain', { speed: 2 });
    sync.schedule();
    session.scene = sceneOf('rain', { speed: 3 });
    sync.schedule();
    expect(timers.pendingCount()).toBe(1);
    timers.fire();
    await Promise.resolve();
    expect(calls).toHaveLength(1);
    expect(calls[0][2].layers[0].options.speed).toBe(3);
  });

  test('l’état est capturé au réglage : passer à un autre preset avant l’échéance n’envoie pas le mauvais', async () => {
    const { sync, session, calls, timers } = setup();
    sync.schedule();
    session.activePresetId = 'b';
    session.scene = sceneOf('bubble');
    timers.fire();
    await Promise.resolve();
    expect(calls).toEqual([['save', 'a', sceneOf('rain', { speed: 1 })]]);
  });

  test('un réglage sur un autre preset envoie tout de suite le précédent', async () => {
    const { sync, session, calls } = setup();
    sync.schedule();
    session.activePresetId = 'b';
    session.scene = sceneOf('bubble');
    sync.schedule();
    await Promise.resolve();
    expect(calls.map((call) => call[1])).toEqual(['a']);
    await sync.flush();
    expect(calls.map((call) => call[1])).toEqual(['a', 'b']);
  });

  test('sans preset actif ou sans effet : aucun brouillon', () => {
    const none = setup({ active: null });
    none.sync.schedule();
    expect(none.timers.pendingCount()).toBe(0);
    const noEffect = setup({ component: null });
    noEffect.sync.schedule();
    expect(noEffect.timers.pendingCount()).toBe(0);
    const brandingOnly = setup({ component: null });
    brandingOnly.session.scene = { ...sceneOf(null), layers: [{ id: 'branding', kind: 'branding', visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: {} }] };
    brandingOnly.sync.schedule();
    expect(brandingOnly.timers.pendingCount()).toBe(0);
  });

  test('flush envoie sans attendre le délai', async () => {
    const { sync, calls, timers } = setup();
    sync.schedule();
    await sync.flush();
    expect(calls).toHaveLength(1);
    expect(timers.pendingCount()).toBe(0);
  });

  test('un échec d’envoi est signalé, jamais avalé', async () => {
    const { errors, timers } = setup();
    const failing = createPresetDraftSync({
      client: { readDrafts: async () => ({}), saveDraft: async () => { throw new Error('réseau'); }, discardDraft: async () => {} },
      snapshot: () => ({ scene: sceneOf('rain'), activePresetId: 'a' }),
      onError: (message) => errors.push(message), ...timers,
    });
    failing.schedule();
    await failing.flush();
    expect(errors).toEqual(['brouillon non enregistré : réseau']);
  });
});

describe('lecture, oubli et abandon', () => {
  test('load range les brouillons du serveur et prévient', async () => {
    const { sync, changes } = setup();
    await sync.load();
    expect(sync.get('z')).toEqual(sceneOf('bubble'));
    expect(changes()).toBeGreaterThan(0);
  });

  test('serveur sans la route : signalé une fois, plus rien n’est envoyé', async () => {
    const { sync, calls, errors, timers } = setup({ failWith: 'not found' });
    await sync.load();
    expect(errors).toHaveLength(1);
    sync.schedule();
    timers.fire();
    await sync.flush();
    expect(calls).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  test('forget annule l’envoi en attente du preset : l’enregistrement ne doit pas recréer son brouillon', async () => {
    const { sync, calls, timers } = setup();
    sync.schedule();
    sync.forget('a');
    timers.fire();
    await sync.flush();
    expect(calls).toEqual([]);
  });

  test('forget d’un autre preset ne touche pas à l’envoi en attente', async () => {
    const { sync, calls, timers } = setup();
    sync.schedule();
    sync.forget('autre');
    timers.fire();
    await Promise.resolve();
    expect(calls).toHaveLength(1);
  });

  test('discard retire localement puis sur le serveur', async () => {
    const { sync, calls } = setup();
    await sync.load();
    await sync.discard('z');
    expect(sync.has('z')).toBe(false);
    expect(calls).toEqual([['discard', 'z']]);
  });
});
