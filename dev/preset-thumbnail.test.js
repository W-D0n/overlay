import { expect, test } from 'bun:test';
import { STAGE_HEIGHT, STAGE_WIDTH } from './preview-stage.js';
import { sceneFromCurrent } from '../scene-doc.js';
import { createPresetThumbnail, onceVisible, THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH } from './preset-thumbnail.js';

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

test('la vignette a le rapport de la source OBS : un autre rapport mentirait sur le cadrage', () => {
  expect(THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT).toBeCloseTo(STAGE_WIDTH / STAGE_HEIGHT, 6);
});

test('l’effet est monté à la taille réelle de la source puis réduit, pas redessiné à petite échelle', () => {
  const created = [];
  const fakeElement = () => {
    const node = { style: {}, dataset: {}, appendChild() {}, addEventListener() {}, remove() {} };
    created.push(node);
    return node;
  };
  const { el } = createPresetThumbnail({
    scene: sceneFromCurrent({ component: 'rain', options: {} }),
    documentRef: { createElement: fakeElement },
    delay: () => new Promise(() => {}),
  });
  const stage = created.find(({ className }) => className === 'preset-thumb-stage');
  expect(stage.style.width).toBe(`${STAGE_WIDTH}px`);
  expect(stage.style.height).toBe(`${STAGE_HEIGHT}px`);
  expect(stage.style.transform).toBe(`scale(${THUMBNAIL_WIDTH / STAGE_WIDTH})`);
  expect(el.dataset.state).toBe('pending');
});
