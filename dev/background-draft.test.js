import { expect, test } from 'bun:test';
import { createDraftTracker } from './background-draft.js';

const onAir = { component: 'RainBackground', options: { intensity: 1 } };

test('au départ rien n’est en brouillon', () => {
  const draft = createDraftTracker();
  expect(draft.isDraft()).toBe(false);
  expect(draft.published()).toBeNull();
});

test('une modification ou une arrivée de preset ouvre un brouillon ; seule l’arrivée porte la transition', () => {
  const draft = createDraftTracker();
  draft.edited();
  expect(draft.isDraft()).toBe(true);
  expect(draft.hasArrival()).toBe(false);
  draft.arrived();
  expect(draft.hasArrival()).toBe(true);
});

test('publier ou se synchroniser avec l’antenne ferme le brouillon et mémorise l’état en antenne', () => {
  const draft = createDraftTracker();
  draft.arrived();
  draft.synced(onAir);
  expect(draft.isDraft()).toBe(false);
  expect(draft.hasArrival()).toBe(false);
  expect(draft.published()).toEqual(onAir);
});

test('un état reçu de l’antenne n’écrase jamais un brouillon mais met à jour l’état en antenne', () => {
  const draft = createDraftTracker();
  draft.synced(onAir);
  draft.edited();
  const other = { component: 'BubbleBackground', options: {} };
  expect(draft.shouldApplyIncoming(other)).toBe(false);
  expect(draft.isDraft()).toBe(true);
  expect(draft.published()).toEqual(other);
});

test('sans brouillon, l’état reçu est appliqué', () => {
  const draft = createDraftTracker();
  expect(draft.shouldApplyIncoming(onAir)).toBe(true);
});
