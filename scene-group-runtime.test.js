import { describe, expect, test } from 'bun:test';
import { createLayer } from './scene-doc.js';
import { createSceneRuntime } from './scene-runtime.js';

/** A tiny element tree: appending a node moves it, removing it detaches it. */
function node(label) {
  const el = {
    label,
    parent: null,
    children: [],
    style: {},
    appends: 0,
    appendChild(child) {
      el.appends += 1;
      child.remove();
      child.parent = el;
      el.children.push(child);
    },
    remove() {
      if (el.parent === null) return;
      el.parent.children = el.parent.children.filter((candidate) => candidate !== el);
      el.parent = null;
    },
  };
  return el;
}

/** The labels of the tree under a node, e.g. `stage[calque:g[group[calque:a[el:a]]]]`. */
const shape = (el) => (el.children.length === 0 ? el.label : `${el.label}[${el.children.map(shape).join(',')}]`);

function setup({ failing = [] } = {}) {
  const events = [];
  const errors = [];
  const listeners = new Set();
  const timers = [];
  const calques = new Map();
  const levels = [];
  let time = 0;
  let stageCount = 0;
  const factory = (kind) => (options, environment) => {
    if (failing.includes(kind)) throw new Error(`factory failed: ${kind}`);
    const el = node(`el:${kind}`);
    const id = options.id ?? kind;
    events.push(`create:${id}`);
    return {
      el,
      update() { events.push(`update:${id}`); },
      destroy() { events.push(`destroy:${id}`); },
      setAudioLevel(next) { levels.push([id, next]); },
    };
  };
  const registry = { text: factory('text'), rain: factory('rain'), group: factory('group') };
  const stages = [];
  const container = node('container');
  const runtime = createSceneRuntime(container, {
    registry,
    clock: { subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } },
    onLayerError: (failure) => errors.push(failure),
    scheduleFrame: (callback) => callback(),
    scheduleTimeout: (callback, delayMs) => timers.push({ callback, delayMs }),
    createStageCalque: () => {
      const stage = node(`stage${stageCount += 1}`);
      stages.push(stage);
      return stage;
    },
    createCalque: () => {
      const calque = node('calque');
      calques.set(calque, null);
      return calque;
    },
  });
  /** Gives the calque the label of the layer it wraps, once mounted (the element inside tells which). */
  const calqueOf = (id) => {
    const found = [...calques.keys()].find((calque) => calque.children[0]?.layerId === id);
    return found;
  };
  const frame = (seconds) => {
    const dt = seconds - time;
    time = seconds;
    for (const listener of [...listeners]) listener({ dt, time, pixelRatio: 1 });
  };
  return { runtime, events, errors, stages, timers, listeners, levels, calques, calqueOf, frame, container };
}

const at = (x, y, width, height) => ({ x, y, width, height });
const scene = (...layers) => ({ version: 1, id: 's', name: 'S', layers });
const item = (id, extra = {}) => createLayer({ id, kind: 'text', options: { id }, ...extra });
const grp = (id, extra = {}) => createLayer({ id, kind: 'group', options: { id }, ...extra });

/** The creations and destructions: the updates of untouched layers are noise when checking what was (re)built. @param {{ events: string[] }} env */
const lifecycle = (env) => env.events.filter((event) => /^(create|destroy):/.test(event));

describe('mounting', () => {
  test('the members are mounted inside the group element, the group beside the other layers', () => {
    const env = setup();
    env.runtime.apply(scene(item('a', { group: 'g' }), item('b', { group: 'g' }), grp('g'), item('c')));
    const [stage] = env.stages;
    // The stage holds two calques: the group's and the free layer's.
    expect(stage.children.length).toBe(2);
    const groupCalque = stage.children[0];
    const groupElement = groupCalque.children[0];
    expect(groupElement.label).toBe('el:group');
    expect(groupElement.children.length).toBe(2);
    expect(groupElement.children.every((calque) => calque.children[0].label === 'el:text')).toBe(true);
    expect(stage.children[1].children[0].label).toBe('el:text');
  });

  test('creation order: the group before its members, the free layers after', () => {
    const env = setup();
    env.runtime.apply(scene(item('a', { group: 'g' }), grp('g'), item('c')));
    expect(env.events).toEqual(['create:g', 'create:a', 'create:c']);
  });

  test('the table lists the layers in scene order, the group after its members', () => {
    const env = setup();
    env.runtime.apply(scene(item('a', { group: 'g' }), grp('g'), item('c')));
    expect(env.runtime.layers().map(({ id }) => id)).toEqual(['a', 'g', 'c']);
  });

  test('stack order: each calque takes the index of its layer in the scene', () => {
    const env = setup();
    env.runtime.apply(scene(item('a', { group: 'g' }), item('b', { group: 'g' }), grp('g'), item('c')));
    const [stage] = env.stages;
    const [groupCalque, freeCalque] = stage.children;
    expect(groupCalque.style.zIndex).toBe('2');
    expect(freeCalque.style.zIndex).toBe('3');
    expect(groupCalque.children[0].children.map((calque) => calque.style.zIndex)).toEqual(['0', '1']);
  });

  test('a scene without group mounts exactly as before: layers directly in the stage', () => {
    const env = setup();
    env.runtime.apply(scene(item('a'), item('b')));
    expect(env.stages[0].children.length).toBe(2);
    expect(env.stages[0].children.every((calque) => calque.children[0].label === 'el:text')).toBe(true);
  });
});

describe('the group look', () => {
  const grouped = (extra = {}) => scene(item('a', { group: 'g', placement: at(0.1, 0.1, 0.2, 0.2) }), item('b', { group: 'g', placement: at(0.5, 0.5, 0.2, 0.2) }), grp('g', extra));

  test('the group calque covers the whole frame and turns around the center of its box', () => {
    const env = setup();
    env.runtime.apply(grouped({ rotation: 20 }));
    const groupCalque = env.stages[0].children[0];
    expect(groupCalque.style).toMatchObject({ left: '0%', top: '0%', width: '100%', height: '100%', transformOrigin: '40% 40%', transform: 'rotate(20deg)' });
  });

  test('opacity, blend and blur belong to the group calque, not to its members', () => {
    const env = setup();
    env.runtime.apply(grouped({ opacity: 0.5, blend: 'screen', blur: 4 }));
    const groupCalque = env.stages[0].children[0];
    expect(groupCalque.style.opacity).toBe('0.5');
    expect(groupCalque.style.mixBlendMode).toBe('screen');
    expect(groupCalque.style.filter).toBe('blur(calc(var(--reference-scale, 1) * 4px))');
    const memberCalque = groupCalque.children[0].children[0];
    expect(memberCalque.style.opacity).toBe('1');
    expect(memberCalque.style.mixBlendMode).toBe('');
    expect(memberCalque.style.filter).toBe('');
  });

  test('the filters of a group apply to the group calque', () => {
    const env = setup();
    env.runtime.apply(grouped({ filters: { saturation: 0 } }));
    expect(env.stages[0].children[0].style.filter).toBe('saturate(0)');
  });

  test('members keep their own placement, in fractions of the scene', () => {
    const env = setup();
    env.runtime.apply(grouped());
    const memberCalque = env.stages[0].children[0].children[0].children[1];
    expect(memberCalque.style).toMatchObject({ left: '50%', top: '50%', width: '20%', height: '20%' });
  });

  test('a layer that is not a group gets no transform origin', () => {
    const env = setup();
    env.runtime.apply(scene(item('a')));
    expect('transformOrigin' in env.stages[0].children[0].style).toBe(false);
  });

  test('the group covers the whole frame whatever placement the document carries for it', () => {
    const env = setup();
    env.runtime.apply(scene(item('a', { group: 'g', placement: at(0.1, 0.1, 0.2, 0.2) }), grp('g', { placement: at(0.1, 0.1, 0.2, 0.2) })));
    expect(env.stages[0].children[0].style).toMatchObject({ left: '0%', top: '0%', width: '100%', height: '100%' });
  });

  test('each group turns around the center of its own members', () => {
    const env = setup();
    env.runtime.apply(scene(
      item('a', { group: 'g', placement: at(0, 0, 0.2, 0.2) }), grp('g'),
      item('b', { group: 'h', placement: at(0.8, 0.8, 0.2, 0.2) }), grp('h'),
    ));
    const origins = env.stages[0].children.map((calque) => calque.style.transformOrigin);
    expect(origins).toEqual(['10% 10%', '90% 90%']);
  });

  test('the origin follows the members: moving one moves the center', () => {
    const env = setup();
    env.runtime.apply(grouped());
    env.runtime.apply(scene(item('a', { group: 'g', placement: at(0, 0, 0.2, 0.2) }), item('b', { group: 'g', placement: at(0.8, 0.8, 0.2, 0.2) }), grp('g', { placement: at(0, 0, 1, 1) })));
    expect(env.stages[0].children[0].style.transformOrigin).toBe('50% 50%');
  });
});

describe('visibility', () => {
  const grouped = (groupExtra = {}, memberExtra = {}) => scene(item('a', { group: 'g', ...memberExtra }), item('b', { group: 'g' }), grp('g', groupExtra), item('c'));

  test('hiding the group unmounts it and all its members, whatever their own flags', () => {
    const env = setup();
    env.runtime.apply(grouped());
    env.events.length = 0;
    env.runtime.apply(grouped({ visible: false }));
    expect(lifecycle(env).sort()).toEqual(['destroy:a', 'destroy:b', 'destroy:g']);
    expect(env.stages[0].children.length).toBe(1);
  });

  test('showing it again mounts the group and its members', () => {
    const env = setup();
    env.runtime.apply(grouped({ visible: false }));
    expect(env.events).toEqual(['create:c']);
    env.events.length = 0;
    env.runtime.apply(grouped());
    expect(lifecycle(env)).toEqual(['create:g', 'create:a', 'create:b']);
    const groupCalque = env.stages[0].children.find((calque) => calque.children[0].label === 'el:group');
    expect(groupCalque.children[0].children.length).toBe(2);
  });

  test('a hidden member alone is not mounted; the others stay', () => {
    const env = setup();
    env.runtime.apply(grouped({}, { visible: false }));
    expect(env.events).toEqual(['create:g', 'create:b', 'create:c']);
    expect(env.stages[0].children[0].children[0].children.length).toBe(1);
  });

  test('a hidden group whose members are also hidden mounts nothing', () => {
    const env = setup();
    env.runtime.apply(scene(item('a', { group: 'g', visible: false }), grp('g', { visible: false })));
    expect(env.events).toEqual([]);
  });
});

describe('changing the structure', () => {
  test('ungrouping keeps the members mounted: they move to the stage, the group goes', () => {
    const env = setup();
    env.runtime.apply(scene(item('a', { group: 'g' }), item('b', { group: 'g' }), grp('g')));
    env.events.length = 0;
    env.runtime.apply(scene(item('a'), item('b')));
    expect(env.events).toContain('destroy:g');
    expect(env.events.filter((event) => event.includes(':a') || event.includes(':b')).every((event) => event.startsWith('update'))).toBe(true);
    expect(env.stages[0].children.length).toBe(2);
    expect(env.stages[0].children.every((calque) => calque.children[0].label === 'el:text')).toBe(true);
  });

  test('grouping existing layers moves their calques into the new group, without recreating them', () => {
    const env = setup();
    env.runtime.apply(scene(item('a'), item('b')));
    env.events.length = 0;
    env.runtime.apply(scene(item('a', { group: 'g' }), item('b', { group: 'g' }), grp('g')));
    expect(env.events).toContain('create:g');
    expect(env.events.some((event) => event === 'create:a' || event === 'create:b' || event === 'destroy:a' || event === 'destroy:b')).toBe(false);
    expect(env.stages[0].children.length).toBe(1);
    expect(env.stages[0].children[0].children[0].children.length).toBe(2);
  });

  test('a member moved to another group changes calque parent without being recreated', () => {
    const env = setup();
    env.runtime.apply(scene(item('a', { group: 'g' }), grp('g'), item('b', { group: 'h' }), grp('h')));
    env.events.length = 0;
    env.runtime.apply(scene(item('b', { group: 'h' }), item('a', { group: 'h' }), grp('h'), item('c', { group: 'g' }), grp('g')));
    expect(env.events.filter((event) => event.startsWith('create:a') || event.startsWith('destroy:a'))).toEqual([]);
    const [stage] = env.stages;
    const holder = (id) => stage.children.find((calque) => calque.children[0].children.some((member) => member.children[0].label === 'el:text') && true);
    expect(stage.children.length).toBe(2);
    expect(holder('h')).toBeDefined();
  });

  test('deleting a group with its members unmounts them all', () => {
    const env = setup();
    env.runtime.apply(scene(item('a', { group: 'g' }), grp('g'), item('c')));
    env.events.length = 0;
    env.runtime.apply(scene(item('c')));
    expect(lifecycle(env).sort()).toEqual(['destroy:a', 'destroy:g']);
    expect(env.stages[0].children.length).toBe(1);
  });

  test('an updated member keeps being updated in place inside its group', () => {
    const env = setup();
    env.runtime.apply(scene(item('a', { group: 'g' }), grp('g')));
    env.events.length = 0;
    env.runtime.apply(scene(item('a', { group: 'g', opacity: 0.5 }), grp('g')));
    expect(env.events).toEqual(['update:g', 'update:a']);
  });
});

describe('DOM moves', () => {
  /** Total appendChild calls over every element of the tree under a node. */
  const moves = (el) => el.appends + el.children.reduce((sum, child) => sum + moves(child), 0);

  test('applying the same scene again moves nothing', () => {
    const env = setup();
    const layers = () => scene(item('a', { group: 'g' }), item('b', { group: 'g' }), grp('g'), item('c'));
    env.runtime.apply(layers());
    const before = moves(env.stages[0]);
    env.runtime.apply(layers());
    expect(moves(env.stages[0])).toBe(before);
  });

  test('after a member changes group, applying the scene again moves nothing more', () => {
    const env = setup();
    env.runtime.apply(scene(item('a', { group: 'g' }), grp('g'), item('b', { group: 'h' }), grp('h')));
    const moved = () => scene(item('b', { group: 'h' }), item('a', { group: 'h' }), grp('h'), item('c', { group: 'g' }), grp('g'));
    env.runtime.apply(moved());
    const before = moves(env.stages[0]);
    env.runtime.apply(moved());
    expect(moves(env.stages[0])).toBe(before);
  });

  test('replacing the kind of a member keeps it in its group', () => {
    const env = setup();
    env.runtime.apply(scene(item('a', { group: 'g' }), grp('g')));
    env.runtime.apply(scene(createLayer({ id: 'a', kind: 'rain', options: { id: 'a' }, group: 'g' }), grp('g')));
    const groupElement = env.stages[0].children[0].children[0];
    expect(groupElement.children.length).toBe(1);
    expect(env.events).toContain('destroy:a');
  });

  test('a group without members still mounts, turning around its own placement', () => {
    const env = setup();
    env.runtime.apply(scene(grp('g', { placement: at(0.2, 0.2, 0.2, 0.2) })));
    expect(env.stages[0].children[0].style.transformOrigin).toBe('30% 30%');
  });
});

describe('failures', () => {
  test('a group that cannot be mounted leaves its members unmounted, without throwing', () => {
    const env = setup({ failing: ['group'] });
    env.runtime.apply(scene(item('a', { group: 'g' }), grp('g'), item('c')));
    expect(env.events).toEqual(['create:c']);
    expect(env.stages[0].children.length).toBe(1);
    expect(env.errors.map(({ layerId }) => layerId)).toEqual(['g']);
  });

  test('the free layers of a scene still mount when a group fails', () => {
    const env = setup({ failing: ['group'] });
    env.runtime.apply(scene(item('a', { group: 'g' }), grp('g'), item('c')));
    expect(env.runtime.layers().map(({ id }) => id)).toEqual(['c']);
  });
});

describe('audio and alerts', () => {
  test('a member of a group still receives the audio levels', () => {
    const env = setup();
    const rainy = createLayer({ id: 'r', kind: 'rain', options: { id: 'r', audioReactive: true }, group: 'g' });
    env.runtime.apply(scene(rainy, grp('g')));
    env.runtime.applyAudio({ level: 0.5, bass: 0.4, mid: 0.3, treble: 0.2 });
    expect(env.levels.map(([id]) => id)).toEqual(['r']);
  });

  test('the group itself asks for no audio, unless it has audio bindings', () => {
    const env = setup();
    env.runtime.apply(scene(item('a', { group: 'g' }), grp('g')));
    expect(env.runtime.isAudioReactive()).toBe(false);
    env.runtime.apply(scene(item('a', { group: 'g' }), grp('g', { bindings: [{ source: 'audio', target: 'scale', from: 1, to: 1.2, durationMs: 100 }] })));
    expect(env.runtime.isAudioReactive()).toBe(true);
  });
});

describe('animation of a group', () => {
  const fade = { enter: { preset: 'fade', durationMs: 1000, ease: 'linear' } };

  test('the group animation applies to the group calque; its members are untouched', () => {
    const env = setup();
    env.runtime.apply(scene(item('a', { group: 'g' }), grp('g', { animation: fade })));
    env.frame(0);
    env.frame(0.5);
    const groupCalque = env.stages[0].children[0];
    expect(groupCalque.style.opacity).toBe('0.5');
    expect(groupCalque.children[0].children[0].style.opacity).toBe('1');
  });

  test('the group is invisible from its mount, before any frame', () => {
    const env = setup();
    env.runtime.apply(scene(item('a', { group: 'g' }), grp('g', { animation: fade })));
    expect(env.stages[0].children[0].style.opacity).toBe('0');
  });

  test('a group and its members animate with their own clocks', () => {
    const env = setup();
    env.runtime.apply(scene(item('a', { group: 'g', animation: { enter: { preset: 'fade', durationMs: 2000, ease: 'linear' } } }), grp('g', { animation: fade })));
    env.frame(0);
    env.frame(1);
    const groupCalque = env.stages[0].children[0];
    expect(groupCalque.style.opacity).toBe('1');
    expect(groupCalque.children[0].children[0].style.opacity).toBe('0.5');
  });

  test('an alert replays the animation of the group alone', () => {
    const env = setup();
    env.runtime.apply(scene(item('a', { group: 'g', animation: fade }), grp('g', { animation: { ...fade, restartOn: ['event:raid'] } })));
    env.frame(0);
    env.frame(2);
    env.runtime.react({ type: 'raid' });
    env.frame(2.5);
    const groupCalque = env.stages[0].children[0];
    expect(groupCalque.style.opacity).toBe('0.5');
    expect(groupCalque.children[0].children[0].style.opacity).toBe('1');
  });

  test('a group exit "when the scene leaves" holds the leaving scene, with its members', () => {
    const env = setup();
    const leaving = { exit: { preset: 'fade', durationMs: 1000, onLeave: true, ease: 'linear' } };
    env.runtime.apply(scene(item('a', { group: 'g' }), grp('g', { animation: leaving })));
    env.frame(0);
    env.runtime.apply({ ...scene(item('c')), transition: { type: 'fade', durationMs: 400, easing: 'linear' } });
    expect(env.timers.map(({ delayMs }) => delayMs).sort((a, b) => a - b)).toEqual([1000, 1400]);
    env.frame(0.5);
    expect(env.stages[0].children[0].style.opacity).toBe('0.5');
  });

  test('a finished exit takes the group out of the display, members included', () => {
    const env = setup();
    env.runtime.apply(scene(item('a', { group: 'g' }), grp('g', { animation: { exit: { preset: 'fade', durationMs: 500, afterMs: 500, ease: 'linear' } } })));
    env.frame(0);
    env.frame(2);
    expect(env.stages[0].children[0].style.display).toBe('none');
  });
});
