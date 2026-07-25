// @ts-check
import { expect, test } from 'bun:test';
import { createAudioSession, retryDelayMs, RETRY_DELAYS_MS } from './background-audio.js';

/**
 * Harnais : micro simulé, frames et reprises déclenchées à la main — aucun temps réel, aucun
 * périphérique. `runFrames(n)` avance de n images.
 */
function setup({ reactive = true, failWith = null } = {}) {
  const applied = [];
  const stateChanges = [];
  const microphoneCalls = [];
  /** @type {(() => void)[]} */
  const frames = [];
  /** @type {{ callback: () => void, delayMs: number }[]} */
  const retries = [];
  let stopped = 0;
  let isReactive = reactive;
  let nextFailure = failWith;

  const spectrum = new Uint8Array(1024).fill(200);

  const session = createAudioSession({
    mount: {
      isAudioReactive: () => isReactive,
      applyAudio: (levels) => { applied.push(levels); return true; },
    },
    requestMicrophone: async () => {
      microphoneCalls.push('request');
      if (nextFailure !== null) {
        const error = new Error('refus simulé');
        error.name = nextFailure;
        throw error;
      }
      return {
        stream: {},
        spectrum,
        sampleRate: 48000,
        read: () => {},
        stop: () => { stopped += 1; },
      };
    },
    scheduleFrame: (callback) => frames.push(callback),
    scheduleRetry: (callback, delayMs) => retries.push({ callback, delayMs }),
    onStateChange: (state) => stateChanges.push(state),
  });

  return {
    session,
    applied,
    stateChanges,
    microphoneCalls,
    retries,
    get stopped() { return stopped; },
    setReactive(value) { isReactive = value; },
    setFailure(value) { nextFailure = value; },
    async runFrames(count = 1) {
      for (let i = 0; i < count; i += 1) {
        const next = frames.shift();
        if (next === undefined) return;
        next();
        await Promise.resolve();
      }
    },
    async flush() { await Promise.resolve(); await Promise.resolve(); },
  };
}

test('1. aucun effet réactif monté → le micro n’est jamais demandé', async () => {
  const harness = setup({ reactive: false });
  harness.session.sync();
  await harness.flush();
  expect(harness.microphoneCalls).toEqual([]);
  expect(harness.session.getState().status).toBe('idle');
});

test('2. un effet réactif monté ouvre le micro et diffuse les niveaux', async () => {
  const harness = setup();
  harness.session.sync();
  await harness.flush();
  expect(harness.microphoneCalls).toEqual(['request']);
  expect(harness.session.getState().status).toBe('active');

  await harness.runFrames(2);
  expect(harness.applied.length).toBe(2);
  for (const levels of harness.applied) expect(levels.level).toBeGreaterThan(0);
});

test('3. passer à un effet non réactif relâche le flux', async () => {
  const harness = setup();
  harness.session.sync();
  await harness.flush();

  harness.setReactive(false);
  harness.session.sync();
  expect(harness.stopped).toBe(1);
  expect(harness.session.getState().status).toBe('idle');

  await harness.runFrames(1);
  const before = harness.applied.length;
  await harness.runFrames(1);
  expect(harness.applied.length).toBe(before);
});

test('4. un refus ne lève pas et programme une reprise', async () => {
  const harness = setup({ failWith: 'NotAllowedError' });
  harness.session.sync();
  await harness.flush();

  expect(harness.session.getState()).toEqual({ status: 'unavailable', reason: 'NotAllowedError' });
  expect(harness.retries.length).toBe(1);
  expect(harness.retries[0].delayMs).toBe(RETRY_DELAYS_MS[0]);
});

test('5. une reprise réussie repasse en actif et rediffuse', async () => {
  const harness = setup({ failWith: 'NotFoundError' });
  harness.session.sync();
  await harness.flush();

  harness.setFailure(null);
  harness.retries[0].callback();
  await harness.flush();

  expect(harness.session.getState().status).toBe('active');
  await harness.runFrames(1);
  expect(harness.applied.length).toBe(1);
});

test('6. les reprises successives espacent les tentatives puis plafonnent', async () => {
  const harness = setup({ failWith: 'NotAllowedError' });
  harness.session.sync();
  await harness.flush();

  for (let i = 0; i < 5; i += 1) {
    harness.retries[harness.retries.length - 1].callback();
    await harness.flush();
  }

  expect(harness.retries.map(({ delayMs }) => delayMs)).toEqual([2000, 5000, 15000, 30000, 30000, 30000]);
});

test('7. la perte du flux en cours dégrade sans exception et reprogramme', async () => {
  const harness = setup();
  harness.session.sync();
  await harness.flush();

  harness.session.handleStreamLost();
  expect(harness.stopped).toBe(1);
  expect(harness.session.getState()).toEqual({ status: 'unavailable', reason: 'StreamEnded' });
  expect(harness.retries.length).toBe(1);
});

test('8. un effet démonté pendant l’attente d’autorisation ne laisse pas le micro ouvert', async () => {
  const harness = setup();
  harness.session.sync();
  harness.setReactive(false);
  harness.session.sync();
  await harness.flush();
  expect(harness.stopped).toBe(1);
  expect(harness.session.getState().status).toBe('idle');
});

test('9. sync répété sur un effet déjà réactif ne rouvre pas le micro', async () => {
  const harness = setup();
  harness.session.sync();
  await harness.flush();
  harness.session.sync();
  harness.session.sync();
  await harness.flush();
  expect(harness.microphoneCalls).toEqual(['request']);
});

test('10. destroy relâche le flux et arrête la diffusion', async () => {
  const harness = setup();
  harness.session.sync();
  await harness.flush();

  harness.session.destroy();
  expect(harness.stopped).toBe(1);
  await harness.runFrames(1);
  expect(harness.applied).toEqual([]);
});

test('11. retryDelayMs plafonne sur la dernière valeur déclarée', () => {
  expect(retryDelayMs(0)).toBe(2000);
  expect(retryDelayMs(3)).toBe(30000);
  expect(retryDelayMs(99)).toBe(30000);
});
