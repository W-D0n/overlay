import { describe, expect, test } from 'bun:test';
import { createPhase, createRenderClock } from './render-clock.js';

/** Planificateur de frames piloté à la main : `tick(ms)` joue la frame en attente à cet horodatage. */
function createManualFrames() {
  let pending = null;
  let nextHandle = 1;
  return {
    requestFrame(callback) { pending = { callback, handle: nextHandle }; return nextHandle++; },
    cancelFrame(handle) { if (pending?.handle === handle) pending = null; },
    tick(timestamp) {
      const current = pending;
      pending = null;
      current?.callback(timestamp);
    },
    hasPending: () => pending !== null,
  };
}

function setup(options = {}) {
  const frames = createManualFrames();
  const clock = createRenderClock({
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
    devicePixelRatio: () => 3,
    onError: () => {},
    ...options,
  });
  return { frames, clock };
}

describe('horloge de rendu', () => {
  test('une seule boucle sert tous les abonnés ; elle ne tourne que s’il y en a', () => {
    const { frames, clock } = setup();
    expect(frames.hasPending()).toBe(false);
    const stopA = clock.subscribe(() => {});
    const stopB = clock.subscribe(() => {});
    expect(frames.hasPending()).toBe(true);
    stopA();
    expect(frames.hasPending()).toBe(true);
    stopB();
    expect(frames.hasPending()).toBe(false);
  });

  test('chaque frame livre dt en secondes (0 à la première) et le temps cumulé', () => {
    const { frames, clock } = setup();
    const seen = [];
    clock.subscribe((frame) => seen.push({ dt: frame.dt, time: frame.time }));
    frames.tick(1000);
    frames.tick(1016);
    frames.tick(1050);
    expect(seen[0]).toEqual({ dt: 0, time: 0 });
    expect(seen[1].dt).toBeCloseTo(0.016, 6);
    expect(seen[2].time).toBeCloseTo(0.05, 6);
  });

  test('dt est borné : un onglet suspendu ne fait pas sauter le temps', () => {
    const { frames, clock } = setup();
    const seen = [];
    clock.subscribe((frame) => seen.push(frame));
    frames.tick(0);
    frames.tick(60000);
    expect(seen[1].dt).toBe(0.1);
    expect(seen[1].time).toBe(0.1);
  });

  test('en pause le temps n’avance pas, et la reprise ne produit aucun saut', () => {
    const { frames, clock } = setup();
    const seen = [];
    clock.subscribe((frame) => seen.push(frame));
    frames.tick(0);
    frames.tick(16);
    clock.setPaused(true);
    expect(frames.hasPending()).toBe(false);
    clock.setPaused(false);
    frames.tick(90000);
    expect(seen.at(-1).dt).toBe(0);
    expect(seen.at(-1).time).toBeCloseTo(0.016, 6);
  });

  test('le ratio de pixels suit la qualité : plafond 2 en auto, 1 en performance', () => {
    const { frames, clock } = setup();
    const ratios = [];
    clock.subscribe((frame) => ratios.push(frame.pixelRatio));
    frames.tick(0);
    clock.setQuality('performance');
    frames.tick(16);
    expect(ratios).toEqual([2, 1]);
  });

  test('une couche qui lève est retirée et signalée ; les autres continuent', () => {
    const errors = [];
    const { frames, clock } = setup({ onError: (error) => errors.push(error.message) });
    const healthy = [];
    clock.subscribe(() => { throw new Error('effet cassé'); });
    clock.subscribe((frame) => healthy.push(frame.dt));
    frames.tick(0);
    frames.tick(16);
    frames.tick(32);
    expect(errors).toEqual(['effet cassé']);
    expect(healthy.length).toBe(3);
  });

  test('destroy arrête la boucle et ignore tout nouvel abonnement', () => {
    const { frames, clock } = setup();
    clock.subscribe(() => {});
    clock.destroy();
    expect(frames.hasPending()).toBe(false);
    clock.subscribe(() => {});
    expect(frames.hasPending()).toBe(false);
  });
});

describe('phase', () => {
  test('changer le facteur en cours de route ne déplace pas la position déjà atteinte', () => {
    const phase = createPhase();
    for (let frame = 0; frame < 600; frame += 1) phase.advance(1 / 60 * 0.5);
    const before = phase.value;
    phase.advance(1 / 60 * 3);
    expect(phase.value - before).toBeCloseTo(0.05, 9);
  });
});
