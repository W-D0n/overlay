import { expect, test } from 'bun:test';
import { createReactionCoordinator } from './background-reactions.js';

test('[handle] réaction native → l’overlay n’est pas sollicité', () => {
  const overlayCalls = [];
  const coordinator = createReactionCoordinator({
    mount: { react: () => true },
    overlay: { trigger: (e) => overlayCalls.push(e) },
  });
  coordinator.handle({ type: 'sub' });
  expect(overlayCalls).toEqual([]);
});

test('[handle] pas de réaction native → l’overlay joue', () => {
  const overlayCalls = [];
  const coordinator = createReactionCoordinator({
    mount: { react: () => false },
    overlay: { trigger: (e) => overlayCalls.push(e) },
  });
  coordinator.handle({ type: 'bits' });
  expect(overlayCalls).toEqual([{ type: 'bits' }]);
});
