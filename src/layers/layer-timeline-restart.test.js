import { describe, expect, test } from 'bun:test';
import { RESTART_SOURCES, canonicalSceneTimeline, restartsOn, sceneTimelineErrors } from './layer-timeline.js';
import { canonicalSceneDoc, createLayer, validateSceneDoc } from '../scene/scene-doc.js';
import { createSceneRuntime } from '../scene/scene-runtime.js';

describe('alertes qui relancent la timeline : le modèle', () => {
  test('les alertes proposées sont les impulsions des liaisons, pas le son', () => {
    expect(RESTART_SOURCES.map(({ id }) => id)).toEqual(['event:any', 'event:follow', 'event:sub', 'event:raid', 'event:bits']);
  });

  test('absente ou bien formée : aucune erreur', () => {
    expect(sceneTimelineErrors('t', { durationMs: 4000, loop: 'once' })).toEqual([]);
    expect(sceneTimelineErrors('t', { durationMs: 4000, loop: 'once', restartOn: [] })).toEqual([]);
    expect(sceneTimelineErrors('t', { durationMs: 4000, loop: 'once', restartOn: ['event:raid', 'event:sub'] })).toEqual([]);
  });

  test('une liste mal formée est refusée avec la raison', () => {
    const timeline = { durationMs: 4000, loop: 'once' };
    expect(sceneTimelineErrors('t', { ...timeline, restartOn: 'event:raid' })).toEqual(['t.restartOn : liste attendue']);
    expect(sceneTimelineErrors('t', { ...timeline, restartOn: ['event:inconnue'] })).toEqual(['t.restartOn : alerte inconnue']);
    expect(sceneTimelineErrors('t', { ...timeline, restartOn: ['audio'] })).toEqual(['t.restartOn : alerte inconnue']);
    expect(sceneTimelineErrors('t', { ...timeline, restartOn: ['event:raid', 'event:raid'] })).toEqual(['t.restartOn : une alerte ne figure qu\'une fois']);
  });

  test('la forme canonique range les alertes dans l’ordre des sources et retire une liste vide', () => {
    const base = { durationMs: 4000, loop: 'once' };
    expect(canonicalSceneTimeline({ ...base, restartOn: ['event:raid', 'event:any'] })).toEqual({ ...base, restartOn: ['event:any', 'event:raid'] });
    expect(canonicalSceneTimeline({ ...base, restartOn: [] })).toEqual(base);
    expect(canonicalSceneTimeline(base)).toEqual(base);
  });

  test('une valeur qui n’est pas une liste valide reste telle quelle : c’est la validation qui la refuse', () => {
    const base = { durationMs: 4000, loop: 'once' };
    expect(canonicalSceneTimeline({ ...base, restartOn: 'x' }).restartOn).toBe('x');
    expect(canonicalSceneTimeline({ ...base, restartOn: ['event:raid', 'event:inconnue'] }).restartOn).toEqual(['event:raid', 'event:inconnue']);
  });

  test('la durée reste bornée en même temps', () => {
    expect(canonicalSceneTimeline({ durationMs: 999_999, loop: 'once', restartOn: ['event:raid'] })).toEqual({ durationMs: 60_000, loop: 'once', restartOn: ['event:raid'] });
  });

  test('une alerte relance si sa source ou « toute alerte » est choisie, sinon non', () => {
    const timeline = (restartOn) => ({ durationMs: 4000, loop: 'once', ...(restartOn === undefined ? {} : { restartOn }) });
    expect(restartsOn(timeline(), 'raid')).toBe(false);
    expect(restartsOn(timeline([]), 'raid')).toBe(false);
    expect(restartsOn(timeline(['event:raid']), 'raid')).toBe(true);
    expect(restartsOn(timeline(['event:raid']), 'follow')).toBe(false);
    expect(restartsOn(timeline(['event:any']), 'follow')).toBe(true);
    expect(restartsOn(timeline(['event:any']), 'inconnue')).toBe(true);
    expect(restartsOn(timeline(['event:follow', 'event:sub']), 'sub')).toBe(true);
  });

  test('une scène qui porte la liste est valide, et se canonise', () => {
    const layer = createLayer({ id: 'a', kind: 'text' });
    const scene = { version: 1, id: 's', name: 'S', timeline: { durationMs: 4000, loop: 'once', restartOn: ['event:raid', 'event:any'] }, layers: [layer] };
    expect(validateSceneDoc(scene)).toEqual({ ok: true });
    expect(canonicalSceneDoc(scene).timeline.restartOn).toEqual(['event:any', 'event:raid']);
    expect(validateSceneDoc({ ...scene, timeline: { ...scene.timeline, restartOn: ['event:x'] } }).ok).toBe(false);
  });
});

describe('alertes qui relancent la timeline : le moteur', () => {
  function setup() {
    const listeners = new Set();
    let time = 0;
    const clock = { subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
    const opacities = [];
    const runtime = createSceneRuntime({ appendChild() {} }, {
      registry: { text: () => ({ el: {}, update() {}, destroy() {} }) },
      clock,
      createStageCalque: () => ({ style: {}, appendChild() {}, remove() {} }),
      createCalque: () => ({ style: new Proxy({}, { set: (target, key, value) => { if (key === 'opacity') opacities.push(Number(value)); target[key] = value; return true; } }), appendChild() {}, remove() {} }),
    });
    const frame = (seconds) => {
      const dt = seconds - time;
      time = seconds;
      for (const listener of [...listeners]) listener({ dt, time, pixelRatio: 1 });
    };
    return { runtime, frame, opacities };
  }
  const fade = { target: 'opacity', keys: [{ t: 0, v: 0, ease: 'linear' }, { t: 1000, v: 1, ease: 'linear' }] };
  const scene = (restartOn) => ({ version: 1, id: 's', name: 'S', timeline: { durationMs: 1000, loop: 'once', ...(restartOn === undefined ? {} : { restartOn }) }, layers: [createLayer({ id: 't', kind: 'text', timeline: [fade] })] });

  test('une alerte choisie rejoue l’animation depuis le début, même arrivée à sa fin', () => {
    const { runtime, frame, opacities } = setup();
    runtime.apply(scene(['event:raid']));
    frame(0.5);
    frame(2);
    expect(opacities.at(-1)).toBe(1);
    expect(runtime.timeline.state()).toMatchObject({ timeMs: 1000, playing: true });
    runtime.react({ type: 'raid', username: 'a', amount: 3 });
    expect(runtime.timeline.state().timeMs).toBe(0);
    frame(2.25);
    expect(opacities.at(-1)).toBeCloseTo(0.25, 2);
  });

  test('une autre alerte ne change rien', () => {
    const { runtime, frame } = setup();
    runtime.apply(scene(['event:raid']));
    frame(2);
    runtime.react({ type: 'follow', username: 'a' });
    expect(runtime.timeline.state().timeMs).toBe(1000);
  });

  test('sans liste, aucune alerte ne rejoue l’animation', () => {
    const { runtime, frame } = setup();
    runtime.apply(scene());
    frame(2);
    runtime.react({ type: 'raid' });
    expect(runtime.timeline.state().timeMs).toBe(1000);
  });

  test('« toute alerte » rejoue sur n’importe laquelle', () => {
    const { runtime, frame } = setup();
    runtime.apply(scene(['event:any']));
    frame(2);
    runtime.react({ type: 'bits', amount: 100 });
    expect(runtime.timeline.state().timeMs).toBe(0);
  });

  test('l’alerte relance aussi une lecture mise en pause, et prévient les panneaux', () => {
    const { runtime, frame } = setup();
    runtime.apply(scene(['event:sub']));
    frame(0.1);
    runtime.timeline.pause();
    const states = [];
    runtime.timeline.subscribe((state) => states.push(state));
    runtime.react({ type: 'sub' });
    expect(runtime.timeline.state()).toMatchObject({ timeMs: 0, playing: true });
    expect(states.at(-1)).toMatchObject({ timeMs: 0, playing: true });
  });

  test('un événement sans type ne relance rien et ne casse rien', () => {
    const { runtime, frame } = setup();
    runtime.apply(scene(['event:any']));
    frame(2);
    expect(() => runtime.react({})).not.toThrow();
    expect(() => runtime.react(null)).not.toThrow();
    expect(runtime.timeline.state().timeMs).toBe(1000);
  });
});
