import { expect, test } from 'bun:test';
import { chanceForDelta, frameDeltaSeconds } from './animation-time.js';

test('frameDeltaSeconds mesure le temps réel et borne les longues suspensions', () => {
  expect(frameDeltaSeconds(null, 1000)).toBe(0);
  expect(frameDeltaSeconds(1000, 1016.6667)).toBeCloseTo(1 / 60, 5);
  expect(frameDeltaSeconds(1000, 2000)).toBe(0.1);
  expect(frameDeltaSeconds(2000, 1000)).toBe(0);
});

test('chanceForDelta préserve la probabilité cumulée quel que soit le framerate', () => {
  const chance = 0.006;
  const oneSecondAt60 = 1 - (1 - chanceForDelta(chance, 1 / 60)) ** 60;
  const oneSecondAt30 = 1 - (1 - chanceForDelta(chance, 1 / 30)) ** 30;
  expect(oneSecondAt30).toBeCloseTo(oneSecondAt60, 12);
  expect(chanceForDelta(-1, 1)).toBe(0);
  expect(chanceForDelta(2, 1)).toBe(1);
});
