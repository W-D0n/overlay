import { expect, test } from 'bun:test';
import {
  reactionDuration, followRadius, pulseAlpha, raidBandCenter, bitsCount,
  createReactionScheduler, createReactionLoop,
} from './ReactionOverlay.js';

test('[reactionDuration] durée par type, null si inconnu', () => {
  expect(reactionDuration('follow')).toBe(1800);
  expect(reactionDuration('sub')).toBe(1600);
  expect(reactionDuration('raid')).toBe(2600);
  expect(reactionDuration('bits')).toBe(1400);
  expect(reactionDuration('donation')).toBeNull();
});

test('[followRadius] croît de 0 à la diagonale', () => {
  expect(followRadius(0, 2000)).toBe(0);
  expect(followRadius(1, 2000)).toBe(2000);
});

test('[pulseAlpha] suit sin(π·progress), nul aux bornes, max au milieu', () => {
  expect(pulseAlpha(0)).toBeCloseTo(0);
  expect(pulseAlpha(1)).toBeCloseTo(0);
  expect(pulseAlpha(0.5, 0.3)).toBeCloseTo(0.3);
});

test('[raidBandCenter] balaie de -bande à cssW+bande', () => {
  expect(raidBandCenter(0, 1920, 288)).toBe(-288);
  expect(raidBandCenter(1, 1920, 288)).toBe(1920 + 288);
});

test('[bitsCount] entre 18 et 32', () => {
  expect(bitsCount(() => 0)).toBe(18);
  expect(bitsCount(() => 0.999)).toBe(32);
});

test('[createReactionScheduler] inactif au repos, type inconnu = no-op', () => {
  const s = createReactionScheduler();
  expect(s.isActive).toBe(false);
  expect(s.trigger('donation', 0)).toBe(false);
  expect(s.isActive).toBe(false);
});

test('[createReactionScheduler] sample renvoie la progression puis se termine', () => {
  const s = createReactionScheduler();
  expect(s.trigger('bits', 1000)).toBe(true);
  expect(s.isActive).toBe(true);
  expect(s.sample(1000)).toEqual({ type: 'bits', progress: 0 });
  expect(s.sample(1700)).toEqual({ type: 'bits', progress: 0.5 });
  expect(s.sample(2400)).toBeNull();
  expect(s.isActive).toBe(false);
});

test('[createReactionLoop] ne demande aucune frame avant trigger, s’arrête à la fin', () => {
  let time = 0;
  const requested = [];
  const cancelled = [];
  const scheduler = createReactionScheduler();
  const loop = createReactionLoop({
    scheduler,
    now: () => time,
    requestFrame: (cb) => { requested.push(cb); return requested.length; },
    cancelFrame: (id) => cancelled.push(id),
    onFrame: () => {},
    onStop: () => {},
  });
  expect(requested).toHaveLength(0);

  expect(loop.trigger('follow')).toBe(true); // durée 1800
  expect(loop.running).toBe(true);
  expect(requested).toHaveLength(1);

  time = 900; requested[requested.length - 1](); // encore actif → redemande
  expect(loop.running).toBe(true);
  expect(requested).toHaveLength(2);

  time = 1800; requested[requested.length - 1](); // terminé → stop
  expect(loop.running).toBe(false);
  expect(requested).toHaveLength(2);
});

test('[createReactionLoop] stop annule la frame en cours', () => {
  const scheduler = createReactionScheduler();
  const cancelled = [];
  const loop = createReactionLoop({
    scheduler,
    now: () => 0,
    requestFrame: () => 42,
    cancelFrame: (id) => cancelled.push(id),
    onFrame: () => {},
    onStop: () => {},
  });
  loop.trigger('sub');
  loop.stop();
  expect(cancelled).toEqual([42]);
  expect(loop.running).toBe(false);
});
