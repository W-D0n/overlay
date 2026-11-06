import { afterEach, expect, test } from 'bun:test';
import { RainBackground, rainSpawnRange } from './RainBackground.js';

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

function createRainHarness() {
  /** @type {{ x: number, y: number }[]} */
  let starts = [];
  const context = {
    scale() {},
    clearRect() { starts = []; },
    beginPath() {},
    stroke() {},
    moveTo(x, y) { starts.push({ x, y }); },
    lineTo() {},
    strokeStyle: '',
    lineWidth: 1,
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
  let randomState = 0x12345678;
  let timestamp = 0;

  globalThis.document = /** @type {*} */ ({
    body: { appendChild() {} },
    createElement(tag) {
      if (tag === 'canvas') return canvas;
      return { style: {}, remove() {} };
    },
  });
  globalThis.window = /** @type {*} */ ({ devicePixelRatio: 1 });
  globalThis.getComputedStyle = /** @type {*} */ (() => ({ color: 'rgb(200, 185, 122)' }));
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
  Math.random = () => {
    randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
    return randomState / 0x100000000;
  };

  function drawFrames(count, frameMs = 16.67) {
    for (let i = 0; i < count; i++) {
      const entry = [...frames.entries()].at(-1);
      if (!entry) throw new Error('aucune frame planifiée');
      frames.delete(entry[0]);
      entry[1](timestamp);
      timestamp += frameMs;
    }
    return starts;
  }

  return { drawFrames };
}

test('Rain garde une couverture bord à bord après stabilisation avec un angle élevé', () => {
  const harness = createRainHarness();
  const instance = RainBackground({ intensity: 1, angle: 80, speed: 1 });

  const starts = harness.drawFrames(700);
  const lowerBand = starts.filter(({ y }) => y >= 750 && y <= 1050);
  const xs = lowerBand.map(({ x }) => x);

  expect(lowerBand.length).toBeGreaterThan(20);
  expect(Math.min(...xs)).toBeLessThan(100);
  expect(Math.max(...xs)).toBeGreaterThan(1820);
  instance.destroy?.();
});

test('rainSpawnRange compense symétriquement la dérive horizontale', () => {
  const positive = rainSpawnRange(1920, 1080, 90);
  const negative = rainSpawnRange(1920, 1080, -90);

  expect(positive).toEqual({ minX: -1180, maxX: 2020 });
  expect(negative).toEqual({ minX: -100, maxX: 3100 });
});

test('modifier speed accélère immédiatement les gouttes existantes', () => {
  const harness = createRainHarness();
  const instance = RainBackground({ intensity: 1, angle: 0, speed: 1 });

  harness.drawFrames(1);
  const second = harness.drawFrames(1);
  const index = second.findIndex(({ y }) => y < 500);
  const third = harness.drawFrames(1);
  const normalDelta = third[index].y - second[index].y;

  instance.update?.({ speed: 2 });
  const fourth = harness.drawFrames(1);
  const fifth = harness.drawFrames(1);
  const fastDelta = fifth[index].y - fourth[index].y;

  expect(fastDelta).toBeCloseTo(normalDelta * 2, 8);
  instance.destroy?.();
});

test('une seconde de pluie parcourt la même distance à 30 fps et 60 fps', () => {
  function displacement(frameCount, frameMs) {
    const harness = createRainHarness();
    const instance = RainBackground({ intensity: 1, angle: 0, speed: 0.1 });
    const first = harness.drawFrames(1, frameMs);
    const index = first.findIndex(({ y }) => y < 500);
    const last = harness.drawFrames(frameCount - 1, frameMs);
    const distance = last[index].y - first[index].y;
    instance.destroy?.();
    return distance;
  }

  // Une frame supplémentaire capture la position après l'update de t=1000 ms : le composant
  // dessine d'abord, puis intègre le delta pour la frame suivante.
  const at60Fps = displacement(62, 1000 / 60);
  const at30Fps = displacement(32, 1000 / 30);
  expect(at30Fps).toBeCloseTo(at60Fps, 1);
});
