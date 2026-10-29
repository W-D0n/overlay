import { expect, test } from 'bun:test';
import { onceVisible } from './preset-thumbnail.js';

function fakeObserverFactory() {
  const observers = [];
  const create = (callback) => {
    const observer = { callback, observed: [], disconnected: false, observe(el) { this.observed.push(el); }, disconnect() { this.disconnected = true; } };
    observers.push(observer);
    return observer;
  };
  return { create, observers };
}

test('la capture attend que la vignette soit affichée : un panneau masqué ne photographie pas un canvas vide', () => {
  const { create, observers } = fakeObserverFactory();
  let captures = 0;
  onceVisible({}, create, () => { captures += 1; });
  observers[0].callback([{ isIntersecting: false }]);
  expect(captures).toBe(0);
  observers[0].callback([{ isIntersecting: true }]);
  expect(captures).toBe(1);
  expect(observers[0].disconnected).toBe(true);
});

test('la capture n’est déclenchée qu’une fois', () => {
  const { create, observers } = fakeObserverFactory();
  let captures = 0;
  onceVisible({}, create, () => { captures += 1; });
  observers[0].callback([{ isIntersecting: true }]);
  observers[0].callback([{ isIntersecting: true }]);
  expect(captures).toBe(1);
});

test('l’annulation débranche l’observateur avant toute capture', () => {
  const { create, observers } = fakeObserverFactory();
  let captures = 0;
  const cancel = onceVisible({}, create, () => { captures += 1; });
  cancel();
  expect(observers[0].disconnected).toBe(true);
  expect(captures).toBe(0);
});

test('sans IntersectionObserver (environnement de test), la capture démarre aussitôt', () => {
  let captures = 0;
  onceVisible({}, null, () => { captures += 1; });
  expect(captures).toBe(1);
});
