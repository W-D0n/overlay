import { describe, expect, test } from 'bun:test';
import { createSceneRuntime } from './scene-runtime.js';
import { createLayer } from './scene-doc.js';

/** Un monde factice : un calque par couche dont on compte les écritures de style, et une horloge qu'on fait avancer à la main. */
function setup() {
  const calques = [];
  const writes = [];
  const listeners = new Set();
  let time = 0;
  const clock = { subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
  const registry = { text: () => ({ el: {}, update() {}, destroy() {} }), rain: () => ({ el: {}, update() {}, destroy() {} }) };
  const runtime = createSceneRuntime({ appendChild() {} }, {
    registry,
    clock,
    createStageCalque: () => ({ style: {}, appendChild() {}, remove() {} }),
    createCalque: () => {
      const style = new Proxy({}, { set: (target, key, value) => { writes.push([calques.length, key, value]); target[key] = value; return true; } });
      const calque = { style, appendChild() {}, remove() {} };
      calques.push(calque);
      return calque;
    },
  });
  /** Une image à `seconds` secondes du départ. */
  const frame = (seconds) => {
    const dt = seconds - time;
    time = seconds;
    for (const listener of [...listeners]) listener({ dt, time, pixelRatio: 1 });
  };
  return { runtime, calques, writes, listeners, frame };
}
const scene = (...layers) => ({ version: 1, id: 's', name: 'S', layers });
const text = (extra = {}) => createLayer({ id: 'titre', kind: 'text', ...extra });
const pulseBinding = { source: 'event:raid', target: 'opacity', from: 0, to: 1, durationMs: 1000 };
const audioBinding = { source: 'audio', target: 'scale', from: 1, to: 2, durationMs: 0 };

describe('liaisons dans le moteur : horloge', () => {
  test('sans liaison, aucune horloge ; avec une liaison, une seule ; elle s’arrête quand la dernière disparaît', () => {
    const { runtime, listeners } = setup();
    runtime.apply(scene(text()));
    expect(listeners.size).toBe(0);
    runtime.apply(scene(text({ bindings: [pulseBinding] })));
    expect(listeners.size).toBe(1);
    runtime.apply(scene(text({ bindings: [pulseBinding] }), createLayer({ id: 'b', kind: 'rain', bindings: [audioBinding] })));
    expect(listeners.size).toBe(1);
    runtime.apply(scene(text()));
    expect(listeners.size).toBe(0);
  });

  test('masquer la couche liée arrête l’horloge, la remontrer la relance ; détruire la libère', () => {
    const { runtime, listeners } = setup();
    runtime.apply(scene(text({ bindings: [pulseBinding] })));
    runtime.apply(scene(text({ bindings: [pulseBinding], visible: false })));
    expect(listeners.size).toBe(0);
    runtime.apply(scene(text({ bindings: [pulseBinding] })));
    expect(listeners.size).toBe(1);
    runtime.destroy();
    expect(listeners.size).toBe(0);
  });
});

describe('liaisons dans le moteur : alertes', () => {
  test('au repos, la valeur liée est « de » (le titre est invisible) ; l’alerte la fait paraître, puis elle retombe', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(text({ bindings: [pulseBinding] })));
    expect(calques[0].style.opacity).toBe('0');
    frame(1);
    runtime.react({ type: 'raid', username: 'x' });
    frame(1.0);
    expect(calques[0].style.opacity).toBe('1');
    frame(1.5);
    expect(Number(calques[0].style.opacity)).toBeCloseTo(0.25, 2);
    frame(2.1);
    expect(calques[0].style.opacity).toBe('0');
  });

  test('une alerte d’un autre type ne déclenche rien', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(text({ bindings: [pulseBinding] })));
    frame(1);
    runtime.react({ type: 'follow' });
    frame(1.1);
    expect(calques[0].style.opacity).toBe('0');
  });

  test('l’alerte garde son routage habituel : react() rend toujours « traitée nativement ou non »', () => {
    const { runtime } = setup();
    runtime.apply(scene(text({ bindings: [pulseBinding] })));
    expect(runtime.react({ type: 'raid' })).toBe(false);
  });
});

describe('liaisons dans le moteur : son', () => {
  test('une liaison sonore demande le micro même si l’effet ne le gère pas ; sans, non', () => {
    const { runtime } = setup();
    runtime.apply(scene(text()));
    expect(runtime.isAudioReactive()).toBe(false);
    runtime.apply(scene(text({ bindings: [audioBinding] })));
    expect(runtime.isAudioReactive()).toBe(true);
    runtime.apply(scene(text({ bindings: [pulseBinding] })));
    expect(runtime.isAudioReactive()).toBe(false);
  });

  test('le niveau sonore pilote l’échelle ; au silence elle est neutre, et un son qui cesse d’arriver vaut le silence', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(text({ bindings: [audioBinding] })));
    frame(1);
    runtime.applyAudio({ level: 1, bass: 0, mid: 0, treble: 0 });
    frame(1.016);
    expect(calques[0].style.transform).toBe('scale(2)');
    runtime.applyAudio({ level: 0.5, bass: 0, mid: 0, treble: 0 });
    frame(1.032);
    expect(calques[0].style.transform).toBe('scale(1.5)');
    // Plus aucune donnée sonore depuis plus d'une demi-seconde : retour au repos.
    frame(2);
    expect(calques[0].style.transform).toBe('');
  });
});

describe('liaisons dans le moteur : styles', () => {
  test('le décalage, la rotation de la couche et l’échelle se composent dans un seul transform', () => {
    const { runtime, calques, frame } = setup();
    const bindings = [
      { source: 'event:any', target: 'x', from: 0, to: 10, durationMs: 1000 },
      { source: 'event:any', target: 'scale', from: 1, to: 2, durationMs: 1000 },
    ];
    runtime.apply(scene(text({ rotation: 30, bindings })));
    expect(calques[0].style.transform).toBe('rotate(30deg)');
    frame(1);
    runtime.react({ type: 'sub' });
    frame(1);
    expect(calques[0].style.transform).toBe('translate(10%, 0%) rotate(30deg) scale(2)');
  });

  test('une rotation et un flou liés remplacent ceux de la couche', () => {
    const { runtime, calques } = setup();
    runtime.apply(scene(text({ rotation: 30, blur: 4, bindings: [{ source: 'event:any', target: 'rotation', from: 5, to: 40, durationMs: 100 }, { source: 'event:any', target: 'blur', from: 1, to: 9, durationMs: 100 }] })));
    expect(calques[0].style.transform).toBe('rotate(5deg)');
    expect(calques[0].style.filter).toBe('blur(calc(var(--reference-scale, 1) * 1px))');
  });

  test('une liaison au repos n’écrit plus rien aux images suivantes', () => {
    const { runtime, writes, frame } = setup();
    runtime.apply(scene(text({ bindings: [pulseBinding] })));
    frame(1);
    const before = writes.length;
    frame(1.016);
    frame(1.032);
    frame(1.048);
    expect(writes.length - before).toBeLessThanOrEqual(5);
    const settled = writes.length;
    frame(1.064);
    frame(1.08);
    expect(writes.length).toBe(settled);
  });

  test('une couche sans liaison garde exactement ses styles d’avant', () => {
    const { runtime, calques } = setup();
    runtime.apply(scene(text({ opacity: 0.4, rotation: 12 })));
    expect(calques[0].style.opacity).toBe('0.4');
    expect(calques[0].style.transform).toBe('rotate(12deg)');
  });

  test('retirer les liaisons rend à la couche son opacité', () => {
    const { runtime, calques } = setup();
    runtime.apply(scene(text({ opacity: 0.8, bindings: [pulseBinding] })));
    expect(calques[0].style.opacity).toBe('0');
    runtime.apply(scene(text({ opacity: 0.8 })));
    expect(calques[0].style.opacity).toBe('0.8');
  });
});

describe('liaisons dans le moteur : le repos est exact', () => {
  test('image par image, la retombée d’une alerte finit sur la valeur de repos exacte, pas sur un résidu', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(text({ bindings: [pulseBinding] })));
    frame(1);
    runtime.react({ type: 'raid' });
    for (let at = 1; at <= 2.3; at += 0.016) frame(at);
    expect(calques[0].style.opacity).toBe('0');
  });

  test('un son qui s’éteint ramène l’échelle à l’état neutre exact (transform vide)', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(text({ bindings: [{ ...audioBinding, durationMs: 100 }] })));
    frame(1);
    runtime.applyAudio({ level: 1, bass: 0, mid: 0, treble: 0 });
    for (let at = 1.016; at < 1.4; at += 0.016) { runtime.applyAudio({ level: 1, bass: 0, mid: 0, treble: 0 }); frame(at); }
    expect(calques[0].style.transform).not.toBe('');
    for (let at = 1.4; at < 6; at += 0.016) { runtime.applyAudio({ level: 0, bass: 0, mid: 0, treble: 0 }); frame(at); }
    expect(calques[0].style.transform).toBe('');
  });
});

describe('liaisons dans le moteur : des liaisons modifiées repartent de zéro', () => {
  test('changer les liaisons d’une couche oublie le niveau lissé de l’ancienne liaison', () => {
    const { runtime, calques, frame } = setup();
    runtime.apply(scene(text({ bindings: [{ ...audioBinding, durationMs: 100 }] })));
    frame(1);
    for (let at = 1.016; at < 1.4; at += 0.016) { runtime.applyAudio({ level: 1, bass: 0, mid: 0, treble: 0 }); frame(at); }
    expect(calques[0].style.transform).not.toBe('');
    runtime.apply(scene(text({ bindings: [{ ...audioBinding, durationMs: 100, to: 3 }] })));
    runtime.applyAudio({ level: 0, bass: 0, mid: 0, treble: 0 });
    frame(1.43);
    expect(calques[0].style.transform).toBe('');
  });
});
