import { describe, expect, test } from 'bun:test';
import { defineCanvasLayer } from './canvas-layer.js';
import { createRenderClock } from '../render-clock.js';

function createHarness({ width = 800, height = 600 } = {}) {
  const calls = [];
  const canvas = {
    style: {},
    offsetWidth: width,
    offsetHeight: height,
    width: 0,
    height: 0,
    getContext: () => ({
      clearRect: (...args) => calls.push(['clearRect', ...args]),
      scale: (...args) => calls.push(['scale', ...args]),
    }),
  };
  let frame = null;
  const clock = createRenderClock({
    requestFrame: (callback) => { frame = callback; return 1; },
    cancelFrame: () => { frame = null; },
    devicePixelRatio: () => 2,
    onError: () => {},
  });
  const observers = [];
  class FakeObserver {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const environment = { clock, documentRef: { createElement: () => canvas }, ResizeObserverImpl: FakeObserver };
  return {
    calls, canvas, clock, observers, environment,
    tick(timestamp) { const current = frame; frame = null; current?.(timestamp); },
    hasFrame: () => frame !== null,
  };
}

describe('squelette de couche canvas', () => {
  test('la couche dessine après dimensionnement, avec effacement préalable et ratio de pixels', () => {
    const harness = createHarness();
    const events = [];
    const layer = defineCanvasLayer(() => ({
      resize: (size, ratio) => events.push(['resize', size, ratio]),
      draw: (ctx, frame, size) => events.push(['draw', frame.dt, size]),
    }));
    layer({}, harness.environment);
    harness.tick(1000);
    harness.tick(1016);
    expect(events.map(([kind]) => kind)).toEqual(['resize', 'draw', 'draw']);
    // 800×600 est une source plus petite que la référence (hauteur 600 contre 1080) : l'effet reçoit
    // le repère de référence, 1440×1080, et le contexte est réduit d'autant.
    expect(events[0]).toEqual(['resize', { width: 1440, height: 1080 }, 2]);
    expect(harness.canvas.width).toBe(1600);
    expect(harness.calls.filter(([name]) => name === 'clearRect').length).toBe(2);
  });

  test('un conteneur sans taille ne dessine pas et ne redimensionne pas', () => {
    const harness = createHarness({ width: 0, height: 0 });
    const events = [];
    defineCanvasLayer(() => ({ resize: () => events.push('resize'), draw: () => events.push('draw') }))({}, harness.environment);
    harness.tick(0);
    harness.tick(16);
    expect(events).toEqual([]);
  });

  test('la première frame d’une couche a toujours dt = 0, même si l’horloge tourne déjà', () => {
    const harness = createHarness();
    harness.clock.subscribe(() => {});
    harness.tick(0);
    const dts = [];
    defineCanvasLayer(() => ({ resize() {}, draw: (ctx, frame) => dts.push(frame.dt) }))({}, harness.environment);
    harness.tick(50);
    harness.tick(66);
    expect(dts[0]).toBe(0);
    expect(dts[1]).toBeCloseTo(0.016, 6);
  });

  test('un changement de taille rappelle resize une seule fois', () => {
    const harness = createHarness();
    let resizes = 0;
    defineCanvasLayer(() => ({ resize: () => { resizes += 1; }, draw() {} }))({}, harness.environment);
    harness.tick(0);
    harness.observers[0].callback();
    harness.tick(16);
    expect(resizes).toBe(1);
    harness.canvas.offsetWidth = 1000;
    harness.tick(32);
    expect(resizes).toBe(2);
  });

  test('setAudioLevel et trigger n’existent sur l’instance que si la couche les définit', () => {
    const harness = createHarness();
    const bare = defineCanvasLayer(() => ({ resize() {}, draw() {} }))({}, harness.environment);
    expect('setAudioLevel' in bare).toBe(false);
    expect('trigger' in bare).toBe(false);

    const received = [];
    const reactive = defineCanvasLayer(() => ({
      resize() {}, draw() {},
      setAudioLevel: (levels) => received.push(levels),
      trigger: (event) => received.push(event),
    }))({}, harness.environment);
    reactive.setAudioLevel({ level: 0.5 });
    reactive.trigger({ type: 'follow' });
    expect(received).toEqual([{ level: 0.5 }, { type: 'follow' }]);
  });

  test('update est relayé ; destroy arrête l’abonnement à l’horloge et l’observateur', () => {
    const harness = createHarness();
    const updates = [];
    const instance = defineCanvasLayer(() => ({ resize() {}, draw() {}, update: (options) => updates.push(options) }))({}, harness.environment);
    instance.update({ speed: 2 });
    expect(updates).toEqual([{ speed: 2 }]);
    expect(harness.hasFrame()).toBe(true);
    instance.destroy();
    expect(harness.hasFrame()).toBe(false);
    expect(harness.observers[0].disconnected).toBe(true);
  });

  test('destroy appelle le destroy de la couche, extend ajoute des méthodes à l’instance', () => {
    const harness = createHarness();
    const log = [];
    const instance = defineCanvasLayer(() => ({
      resize() {}, draw() {},
      destroy: () => log.push('destroyed'),
      extend: { morphTo: (options) => log.push(['morphTo', options]) },
    }))({}, harness.environment);
    instance.morphTo({ mode: 'react' });
    instance.destroy();
    expect(log).toEqual([['morphTo', { mode: 'react' }], 'destroyed']);
  });

  test('une couche dont draw lève est isolée : une autre couche continue', () => {
    const harness = createHarness();
    const healthy = [];
    defineCanvasLayer(() => ({ resize() {}, draw() { throw new Error('effet cassé'); } }))({}, harness.environment);
    defineCanvasLayer(() => ({ resize() {}, draw: (ctx, frame) => healthy.push(frame.time) }))({}, harness.environment);
    harness.tick(0);
    harness.tick(16);
    harness.tick(32);
    expect(healthy.length).toBe(3);
  });
});

describe('échelle de la source', () => {
  const run = (width, height) => {
    const harness = createHarness({ width, height });
    const sizes = [];
    defineCanvasLayer(() => ({ resize: (size) => sizes.push(size), draw: (ctx, frame, size) => sizes.push(size) }))({}, harness.environment);
    harness.tick(1000);
    return { harness, sizes };
  };

  test('à la résolution de référence, l’effet reçoit exactement la taille de la source et le contexte n’est pas mis à l’échelle', () => {
    const { harness, sizes } = run(1920, 1080);
    expect(sizes[0]).toEqual({ width: 1920, height: 1080 });
    expect(harness.calls.find(([name]) => name === 'scale')).toEqual(['scale', 2, 2]);
  });

  test('sur une source deux fois plus grande, l’effet voit le même repère et le contexte est agrandi du double', () => {
    const { harness, sizes } = run(3840, 2160);
    expect(sizes[0]).toEqual({ width: 1920, height: 1080 });
    expect(harness.calls.find(([name]) => name === 'scale')).toEqual(['scale', 4, 4]);
    expect(harness.canvas.width).toBe(7680);
  });

  test('une source 1440p donne à l’effet un repère de 1080 de haut, la largeur suivant le rapport', () => {
    const { sizes } = run(2560, 1440);
    expect(sizes[0].height).toBeCloseTo(1080, 6);
    expect(sizes[0].width).toBeCloseTo(1920, 6);
    const wide = run(3440, 1440);
    expect(wide.sizes[0].width).toBeCloseTo(3440 / (1440 / 1080), 6);
  });

  test('l’effacement couvre le repère logique, pas la taille en pixels', () => {
    const { harness } = run(3840, 2160);
    expect(harness.calls.find(([name]) => name === 'clearRect')).toEqual(['clearRect', 0, 0, 1920, 1080]);
  });
});

describe('coût de dessin', () => {
  test('mesure le temps de draw par image, lissé ; null avant la première image', () => {
    const harness = createHarness();
    let time = 0;
    const durations = [4, 4, 4];
    const instance = defineCanvasLayer(() => ({
      resize: () => {},
      draw: () => { time += durations.shift() ?? 4; },
    }))({}, { ...harness.environment, now: () => time });
    expect(instance.cost()).toBeNull();
    harness.tick(16);
    expect(instance.cost()).toBe(4);
    harness.tick(32);
    expect(instance.cost()).toBeCloseTo(4);
  });

  test('une couche plus lente que la précédente coûte plus, et la mesure suit le changement doucement', () => {
    const harness = createHarness();
    let time = 0;
    let step = 1;
    const instance = defineCanvasLayer(() => ({ resize: () => {}, draw: () => { time += step; } }))({}, { ...harness.environment, now: () => time });
    harness.tick(16);
    const light = instance.cost();
    step = 10;
    harness.tick(32);
    expect(instance.cost()).toBeGreaterThan(light);
    expect(instance.cost()).toBeLessThan(10);
  });
});

describe('couche statique', () => {
  const make = (harness, events, extra = {}) => defineCanvasLayer((_options, host) => {
    events.push('create');
    return {
      animated: false,
      resize: () => events.push('resize'),
      draw: () => events.push('draw'),
      update: () => { host.invalidate(); },
      ...extra,
    };
  })({}, harness.environment);

  test('elle dessine une fois, puis plus du tout tant que rien ne change', () => {
    const harness = createHarness();
    const events = [];
    make(harness, events);
    for (let time = 16; time <= 160; time += 16) harness.tick(time);
    expect(events.filter((event) => event === 'draw').length).toBe(1);
  });

  test('une mise à jour qui invalide provoque un seul nouveau dessin', () => {
    const harness = createHarness();
    const events = [];
    const instance = make(harness, events);
    harness.tick(16);
    instance.update({});
    harness.tick(32);
    harness.tick(48);
    expect(events.filter((event) => event === 'draw').length).toBe(2);
  });

  test('un changement de taille redessine (le canvas a été effacé par le redimensionnement)', () => {
    const harness = createHarness();
    const events = [];
    make(harness, events);
    harness.tick(16);
    harness.canvas.offsetWidth = 400;
    harness.tick(32);
    expect(events.filter((event) => event === 'draw').length).toBe(2);
    expect(events.filter((event) => event === 'resize').length).toBe(2);
  });

  test('une couche animée par défaut dessine à chaque image', () => {
    const harness = createHarness();
    const events = [];
    defineCanvasLayer(() => ({ resize() {}, draw: () => events.push('draw') }))({}, harness.environment);
    harness.tick(16);
    harness.tick(32);
    harness.tick(48);
    expect(events.length).toBe(3);
  });
});
