import { afterEach, describe, expect, test } from 'bun:test';
import { OrbitingShapesBackground } from './OrbitingShapesBackground.js';

const ORIGINALS = {
  document: globalThis.document,
  window: globalThis.window,
  ResizeObserver: globalThis.ResizeObserver,
  requestAnimationFrame: globalThis.requestAnimationFrame,
  cancelAnimationFrame: globalThis.cancelAnimationFrame,
  getComputedStyle: globalThis.getComputedStyle,
  random: Math.random,
};

afterEach(() => {
  globalThis.document = ORIGINALS.document;
  globalThis.window = ORIGINALS.window;
  globalThis.ResizeObserver = ORIGINALS.ResizeObserver;
  globalThis.requestAnimationFrame = ORIGINALS.requestAnimationFrame;
  globalThis.cancelAnimationFrame = ORIGINALS.cancelAnimationFrame;
  globalThis.getComputedStyle = ORIGINALS.getComputedStyle;
  Math.random = ORIGINALS.random;
});

function createHarness() {
  /** @type {number[]} */
  const radii = [];
  /** @type {string[]} */
  const fillStyles = [];
  const context = {
    scale() {},
    clearRect() {},
    beginPath() {},
    fill() {},
    save() {},
    translate() {},
    rotate() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    arc(_x, _y, radius) { radii.push(radius); },
    set fillStyle(value) { fillStyles.push(value); },
    get fillStyle() { return fillStyles.at(-1) ?? ''; },
  };
  const canvas = {
    style: {},
    offsetWidth: 1920,
    offsetHeight: 1080,
    width: 0,
    height: 0,
    getContext() { return context; },
  };

  /** @type {Map<number, FrameRequestCallback>} */
  const frames = new Map();
  let nextFrameId = 1;

  globalThis.document = /** @type {*} */ ({
    body: { appendChild() {} },
    createElement(tag) {
      if (tag === 'canvas') return canvas;
      return { style: {}, remove() {} };
    },
  });
  globalThis.getComputedStyle = /** @type {*} */ (() => ({ color: 'rgb(200, 185, 122)' }));
  globalThis.window = /** @type {*} */ ({ devicePixelRatio: 1 });
  globalThis.ResizeObserver = /** @type {*} */ (class {
    constructor(callback) { this.callback = callback; }
    observe() { this.callback(); }
    disconnect() {}
  });
  globalThis.requestAnimationFrame = /** @type {*} */ ((callback) => {
    const id = nextFrameId++;
    frames.set(id, callback);
    return id;
  });
  globalThis.cancelAnimationFrame = /** @type {*} */ ((id) => frames.delete(id));
  Math.random = () => 0.5;

  function drawFrame(timestamp = 0) {
    const entry = [...frames.entries()].at(-1);
    if (!entry) throw new Error('aucune frame planifiée');
    frames.delete(entry[0]);
    entry[1](timestamp);
    return radii.at(-1);
  }

  return { radii, fillStyles, drawFrame };
}

describe('OrbitingShapesBackground', () => {
  test('modifier maxSize redimensionne immédiatement les formes déjà affichées', () => {
    const harness = createHarness();
    const instance = OrbitingShapesBackground({ count: 1, minSize: 8, maxSize: 28 });

    const before = harness.drawFrame();
    instance.update?.({ maxSize: 100 });
    const after = harness.drawFrame();

    expect(before).toBeNumber();
    expect(after).toBeGreaterThan(before * 2);
    instance.destroy?.();
  });

  test('opacity multiplie immédiatement l’opacité liée à la profondeur', () => {
    const harness = createHarness();
    const instance = OrbitingShapesBackground({ count: 1, opacity: 1 });

    harness.drawFrame();
    expect(harness.fillStyles.at(-1)).toEndWith(',0.425)');

    instance.update?.({ opacity: 0.5 });
    harness.drawFrame();
    expect(harness.fillStyles.at(-1)).toEndWith(',0.213)');
    instance.destroy?.();
  });
});
