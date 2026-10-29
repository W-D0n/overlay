import { describe, expect, test } from 'bun:test';
import { createSceneRuntime } from './scene-runtime.js';
import { createLayer } from './scene-doc.js';

/** Monde factice : un journal ordonné de tout ce que le moteur fait, sans DOM. */
function setup({ failing = [] } = {}) {
  const events = [];
  const calques = [];
  const container = { appendChild: () => {} };
  const createStageCalque = () => ({
    tag: 'scene',
    style: {},
    children: [],
    appendChild(child) { events.push(`attach:${child.tag}`); this.children.push(child); },
    remove() { events.push('remove:scene'); },
  });
  const createCalque = () => {
    const calque = {
      tag: `calque${calques.length + 1}`,
      style: {},
      children: [],
      appendChild(child) { this.children.push(child); },
      remove() { events.push(`remove:${this.tag}`); },
    };
    calques.push(calque);
    return calque;
  };
  const registry = {};
  for (const kind of ['rain', 'bubble', 'dotgrid', 'broken-update']) {
    registry[kind] = (options) => {
      if (failing.includes(kind)) throw new Error(`fabrique en panne : ${kind}`);
      events.push(`create:${kind}:${options.n ?? ''}`);
      return {
        el: { tag: `el-${kind}` },
        update: (next) => {
          if (kind === 'broken-update') throw new Error('update en panne');
          events.push(`update:${kind}:${next.n ?? ''}`);
        },
        destroy: () => events.push(`destroy:${kind}`),
      };
    };
  }
  const errors = [];
  const runtime = createSceneRuntime(container, { registry, createCalque, createStageCalque, onLayerError: (failure) => errors.push(failure) });
  return { runtime, events, calques, errors };
}

const scene = (...layers) => ({ version: 1, id: 's', name: 'S', layers });
const layer = (id, kind, extra = {}) => createLayer({ id, kind, ...extra });

describe('scene-runtime : montage', () => {
  test('chaque couche est montée dans son calque, dans l’ordre, avec son placement en pourcentages', () => {
    const { runtime, events, calques } = setup();
    runtime.apply(scene(
      layer('fond', 'rain', { options: { n: 1 } }),
      layer('coin', 'bubble', { placement: { x: 0.75, y: 0.05, width: 0.2, height: 0.25 }, opacity: 0.5 }),
    ));
    expect(events).toEqual(['create:rain:1', 'attach:calque1', 'create:bubble:', 'attach:calque2']);
    expect(calques[0].style).toMatchObject({ left: '0%', top: '0%', width: '100%', height: '100%', opacity: '1', zIndex: '0', display: '' });
    expect(calques[1].style).toMatchObject({ left: '75%', top: '5%', width: '20%', height: '25%', opacity: '0.5', zIndex: '1' });
    expect(calques[1].children[0].tag).toBe('el-bubble');
  });

  test('layers() décrit les couches montées dans l’ordre de la scène', () => {
    const { runtime } = setup();
    runtime.apply(scene(layer('a', 'rain'), layer('b', 'bubble', { visible: false })));
    expect(runtime.layers().map(({ id, kind, visible }) => [id, kind, visible])).toEqual([['a', 'rain', true], ['b', 'bubble', false]]);
  });
});

describe('scene-runtime : réconciliation', () => {
  test('même id et même type : update seulement, jamais de recréation', () => {
    const { runtime, events } = setup();
    runtime.apply(scene(layer('a', 'rain', { options: { n: 1 } }), layer('b', 'bubble')));
    events.length = 0;
    runtime.apply(scene(layer('a', 'rain', { options: { n: 2 } }), layer('b', 'bubble')));
    expect(events).toEqual(['update:rain:2', 'update:bubble:']);
  });

  test('type changé sur un id : cette couche est remplacée, les autres ne bougent pas', () => {
    const { runtime, events } = setup();
    runtime.apply(scene(layer('a', 'rain'), layer('b', 'bubble')));
    events.length = 0;
    runtime.apply(scene(layer('a', 'dotgrid'), layer('b', 'bubble')));
    // Le remplaçant est monté avant que l'ancien ne parte : s'il échoue, l'ancien reste affiché.
    expect(events).toEqual(['create:dotgrid:', 'attach:calque3', 'destroy:rain', 'remove:calque1', 'update:bubble:']);
  });

  test('couche retirée : démontée ; couche ajoutée : montée ; les autres inchangées', () => {
    const { runtime, events } = setup();
    runtime.apply(scene(layer('a', 'rain'), layer('b', 'bubble')));
    events.length = 0;
    runtime.apply(scene(layer('b', 'bubble'), layer('c', 'dotgrid')));
    expect(events).toEqual(['destroy:rain', 'remove:calque1', 'update:bubble:', 'create:dotgrid:', 'attach:calque3']);
  });

  test('réordonner ne recrée rien et ne déplace aucun nœud : seul z-index change', () => {
    const { runtime, events, calques } = setup();
    runtime.apply(scene(layer('a', 'rain'), layer('b', 'bubble')));
    events.length = 0;
    runtime.apply(scene(layer('b', 'bubble'), layer('a', 'rain')));
    expect(events.filter((event) => !event.startsWith('update:'))).toEqual([]);
    expect(calques[0].style.zIndex).toBe('1');
    expect(calques[1].style.zIndex).toBe('0');
  });

  test('masquer une couche la cache sans démonter son effet ni toucher aux autres ; la remontrer la restitue', () => {
    const { runtime, events, calques } = setup();
    runtime.apply(scene(layer('a', 'rain'), layer('b', 'bubble')));
    events.length = 0;
    runtime.apply(scene(layer('a', 'rain', { visible: false }), layer('b', 'bubble')));
    expect(calques[0].style.display).toBe('none');
    expect(events.some((event) => event.startsWith('destroy') || event.startsWith('create') || event.startsWith('remove'))).toBe(false);
    runtime.apply(scene(layer('a', 'rain'), layer('b', 'bubble')));
    expect(calques[0].style.display).toBe('');
  });

  test('l’opacité et le placement se mettent à jour sur le calque, sans update d’options superflu de la structure', () => {
    const { runtime, calques } = setup();
    runtime.apply(scene(layer('a', 'rain')));
    runtime.apply(scene(layer('a', 'rain', { opacity: 0.25, placement: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 } })));
    expect(calques[0].style).toMatchObject({ opacity: '0.25', left: '10%', top: '20%', width: '50%', height: '50%' });
  });
});

describe('scene-runtime : isolement des pannes', () => {
  test('une fabrique en panne est signalée, les autres couches se montent', () => {
    const { runtime, errors } = setup({ failing: ['bubble'] });
    runtime.apply(scene(layer('a', 'rain'), layer('b', 'bubble'), layer('c', 'dotgrid')));
    expect(errors.map(({ layerId }) => layerId)).toEqual(['b']);
    expect(runtime.layers().map(({ id }) => id)).toEqual(['a', 'c']);
  });

  test('un type inconnu est signalé avec son nom', () => {
    const { runtime, errors } = setup();
    runtime.apply(scene(layer('a', 'rain'), layer('x', 'inconnu')));
    expect(String(errors[0].error.message)).toContain('inconnu');
    expect(runtime.layers().map(({ id }) => id)).toEqual(['a']);
  });

  test('un update en panne n’arrête pas les couches suivantes et garde la couche en place', () => {
    const { runtime, errors, events } = setup();
    runtime.apply(scene(layer('a', 'broken-update'), layer('b', 'bubble')));
    events.length = 0;
    runtime.apply(scene(layer('a', 'broken-update'), layer('b', 'bubble')));
    expect(errors.map(({ layerId }) => layerId)).toEqual(['a']);
    expect(events).toEqual(['update:bubble:']);
    expect(runtime.layers().map(({ id }) => id)).toEqual(['a', 'b']);
  });

  test('le montage d’une couche en panne est retenté à la scène suivante', () => {
    const { runtime, errors } = setup({ failing: ['bubble'] });
    runtime.apply(scene(layer('b', 'bubble')));
    runtime.apply(scene(layer('b', 'bubble')));
    expect(errors).toHaveLength(2);
  });
});

describe('scene-runtime : un état qu’on ne sait pas afficher laisse l’écran en place', () => {
  test('type inconnu à la place du type affiché : l’effet en place reste monté', () => {
    const { runtime, events, errors } = setup();
    runtime.apply(scene(layer('main', 'rain')));
    events.length = 0;
    runtime.apply(scene(layer('main', 'inconnu')));
    expect(errors).toHaveLength(1);
    expect(events.some((event) => event.startsWith('destroy'))).toBe(false);
    expect(runtime.layers().map(({ kind }) => kind)).toEqual(['rain']);
  });

  test('remplacement dont la fabrique échoue : l’ancien effet reste monté', () => {
    const { runtime, events, errors } = setup({ failing: ['bubble'] });
    runtime.apply(scene(layer('main', 'rain')));
    events.length = 0;
    runtime.apply(scene(layer('main', 'bubble')));
    expect(errors).toHaveLength(1);
    expect(events.some((event) => event.startsWith('destroy'))).toBe(false);
    expect(runtime.layers().map(({ kind }) => kind)).toEqual(['rain']);
  });

  test('arrivée (avec transition) dont aucune couche ne se monte : la scène en place reste, aucun calque résiduel', () => {
    const { runtime, events } = setup();
    runtime.apply(scene(layer('main', 'rain')));
    events.length = 0;
    runtime.apply({ ...scene(layer('main', 'inconnu')), transition: { type: 'fade', durationMs: 600, direction: 'right' } });
    expect(runtime.stageCount()).toBe(1);
    expect(runtime.layers().map(({ kind }) => kind)).toEqual(['rain']);
    expect(events).toContain('remove:scene');
  });

  test('une scène sans couche est un fond absent : tout est démonté', () => {
    const { runtime } = setup();
    runtime.apply(scene(layer('main', 'rain')));
    runtime.apply(scene());
    expect(runtime.stageCount()).toBe(0);
    expect(runtime.layers()).toEqual([]);
  });
});

describe('scene-runtime : routage par capacités sur plusieurs couches', () => {
  function routed() {
    const calls = [];
    const make = (name) => () => ({
      el: { tag: name },
      trigger: (event) => calls.push(`trigger:${name}:${event.type}`),
      setAudioLevel: (levels) => calls.push(`audio:${name}:${levels.level}`),
    });
    const capabilities = {
      rain: { audio: false, reactions: 'overlay' },
      bubble: { audio: true, reactions: 'overlay' },
      dotgrid: { audio: true, reactions: 'native' },
    };
    const container = { appendChild: () => {} };
    const stage = () => ({ style: {}, appendChild() {}, remove() {} });
    const runtime = createSceneRuntime(container, {
      registry: { rain: make('rain'), bubble: make('bubble'), dotgrid: make('dotgrid') },
      createCalque: stage,
      createStageCalque: stage,
      capabilitiesOf: (kind) => capabilities[kind],
    });
    return { runtime, calls };
  }
  const withAudio = { audioReactive: true };

  test('trois couches sans réaction native : react rend false, l’appelant dessine une seule fois', () => {
    const { runtime, calls } = routed();
    runtime.apply(scene(layer('a', 'rain'), layer('b', 'bubble'), layer('c', 'rain')));
    expect(runtime.react({ type: 'raid' })).toBe(false);
    expect(calls).toEqual([]);
  });

  test('une couche native traite la réaction (une fois) et rend true : pas de second dessin', () => {
    const { runtime, calls } = routed();
    runtime.apply(scene(layer('a', 'rain'), layer('b', 'dotgrid'), layer('c', 'bubble')));
    expect(runtime.react({ type: 'raid' })).toBe(true);
    expect(calls).toEqual(['trigger:dotgrid:raid']);
  });

  test('une couche native masquée ne traite pas la réaction', () => {
    const { runtime, calls } = routed();
    runtime.apply(scene(layer('b', 'dotgrid', { visible: false })));
    expect(runtime.react({ type: 'raid' })).toBe(false);
    expect(calls).toEqual([]);
  });

  test('l’audio va à chaque couche visible qui le déclare et l’a demandé, et à aucune autre', () => {
    const { runtime, calls } = routed();
    runtime.apply(scene(
      layer('a', 'rain', { options: withAudio }),
      layer('b', 'bubble', { options: withAudio }),
      layer('c', 'dotgrid', { options: withAudio }),
      layer('d', 'bubble', { options: { audioReactive: false } }),
      layer('e', 'bubble', { options: withAudio, visible: false }),
    ));
    expect(runtime.isAudioReactive()).toBe(true);
    expect(runtime.applyAudio({ level: 0.5 })).toBe(true);
    expect(calls).toEqual(['audio:bubble:0.5', 'audio:dotgrid:0.5']);
  });

  test('sans couche réactive visible, l’audio n’est pas demandé', () => {
    const { runtime } = routed();
    runtime.apply(scene(layer('a', 'rain', { options: withAudio }), layer('b', 'bubble', { options: withAudio, visible: false })));
    expect(runtime.isAudioReactive()).toBe(false);
    expect(runtime.applyAudio({ level: 1 })).toBe(false);
  });
});

describe('scene-runtime : fin de vie', () => {
  test('destroy démonte toutes les couches', () => {
    const { runtime, events } = setup();
    runtime.apply(scene(layer('a', 'rain'), layer('b', 'bubble')));
    events.length = 0;
    runtime.destroy();
    expect(events).toEqual(['destroy:rain', 'remove:calque1', 'destroy:bubble', 'remove:calque2', 'remove:scene']);
    expect(runtime.layers()).toEqual([]);
  });
});
