// @ts-check
/**
 * src/components/DotGridAnimated.test.js — Helpers purs (morph, réactions, rampe de couleur) et temps de pulsation.
 * L'effet lui-même s'instancie avec le banc `layer-test-harness.js` (horloge et canvas factices).
 */
import { test, expect, describe } from 'bun:test';
import {
  lerpModeParams, easeProgress, MODE_PARAMS, degToLUTIndex, buildColorRamp,
  isValidReactionType, computeAmbientDelay, reactionDelta, REACTION_TYPES, planUpdate,
} from './DotGridAnimated.js';

const FROM = { freqX: 0, freqY: 0, freqT: 0, amplitude: 0 };
const TO = { freqX: 1, freqY: 2, freqT: 3, amplitude: 4 };

test('lerpModeParams progress 0 → from exact', () => {
  expect(lerpModeParams(FROM, TO, 0)).toEqual(FROM);
});

test('lerpModeParams progress 1 → to exact', () => {
  expect(lerpModeParams(FROM, TO, 1)).toEqual(TO);
});

test('lerpModeParams progress 0.5 → milieu de chaque champ', () => {
  expect(lerpModeParams(FROM, TO, 0.5)).toEqual({ freqX: 0.5, freqY: 1, freqT: 1.5, amplitude: 2 });
});

test('lerpModeParams mode identique (from === to) → constant quelle que soit la progression', () => {
  for (const progress of [0, 0.3, 0.7, 1]) {
    expect(lerpModeParams(MODE_PARAMS.brb, MODE_PARAMS.brb, progress)).toEqual(MODE_PARAMS.brb);
  }
});

test('easeProgress bornes : linear(0) = 0, linear(1) = 1', () => {
  expect(easeProgress('linear', 0)).toBe(0);
  expect(easeProgress('linear', 1)).toBe(1);
});

test('easeProgress clampe une progression hors [0,1]', () => {
  expect(easeProgress('linear', -5)).toBe(0);
  expect(easeProgress('linear', 5)).toBe(1);
});

test('easeProgress jeton hors domaine → repli easeInOut (cohérent avec toCssEasing)', () => {
  expect(easeProgress('bounce', 0.5)).toBe(easeProgress('easeInOut', 0.5));
  expect(easeProgress(undefined, 0.5)).toBe(easeProgress('easeInOut', 0.5));
});

test('easeProgress chaque jeton valide reste borné à [0,1] sur tout le domaine', () => {
  for (const easing of ['linear', 'easeIn', 'easeOut', 'easeInOut']) {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const eased = easeProgress(easing, t);
      expect(eased).toBeGreaterThanOrEqual(0);
      expect(eased).toBeLessThanOrEqual(1);
    }
  }
});

test('degToLUTIndex mappe deg=-maxDeg/0/+maxDeg sur les index 0/maxDeg/2*maxDeg', () => {
  expect(degToLUTIndex(-30, 30)).toBe(0);
  expect(degToLUTIndex(0, 30)).toBe(30);
  expect(degToLUTIndex(30, 30)).toBe(60);
});

test('degToLUTIndex clampe un deg hors [-maxDeg,maxDeg] (simplex2 peut légèrement dépasser [-1,1])', () => {
  expect(degToLUTIndex(31.5, 30)).toBe(60);
  expect(degToLUTIndex(-31.5, 30)).toBe(0);
  expect(degToLUTIndex(1000, 30)).toBe(60);
  expect(degToLUTIndex(-1000, 30)).toBe(0);
});

test('buildColorRamp interpole les deux couleurs avec un milieu exact', () => {
  expect(buildColorRamp([0, 20, 40], [100, 120, 140], 1)).toEqual([
    [0, 20, 40],
    [50, 70, 90],
    [100, 120, 140],
  ]);
});

// ── Couche 4 — réactions (docs/specs/dotgrid-event-triggers.md) ─────────────

test('isValidReactionType accepte les 4 types, rejette le reste (AC-05)', () => {
  for (const type of REACTION_TYPES) expect(isValidReactionType(type)).toBe(true);
  expect(isValidReactionType('inconnu')).toBe(false);
  expect(isValidReactionType(undefined)).toBe(false);
  expect(isValidReactionType(42)).toBe(false);
});

test('computeAmbientDelay reste dans [45000,90000] (AC-07)', () => {
  expect(computeAmbientDelay(0)).toBe(45000);
  expect(computeAmbientDelay(1)).toBe(90000);
  expect(computeAmbientDelay(0.5)).toBe(67500);
});

test('reactionDelta type inconnu → 0 (défensif)', () => {
  expect(reactionDelta({ type: /** @type {*} */ ('nope'), params: {} }, 0, 0, 0, 1920, 1080, 0.5)).toBe(0);
});

test('reactionDelta sub → boost uniforme, identique quelle que soit la position', () => {
  const reaction = { type: /** @type {const} */ ('sub'), params: {} };
  const a = reactionDelta(reaction, 0, 0, 0, 1920, 1080, 0.5);
  const b = reactionDelta(reaction, 1, 1900, 1000, 1920, 1080, 0.5);
  expect(a).toBeCloseTo(b, 10);
  expect(a).toBeGreaterThan(0);
});

test('reactionDelta sub → nul aux bornes de progression (sin(0)=sin(π)=0)', () => {
  const reaction = { type: /** @type {const} */ ('sub'), params: {} };
  expect(reactionDelta(reaction, 0, 100, 100, 1920, 1080, 0)).toBeCloseTo(0, 10);
  expect(reactionDelta(reaction, 0, 100, 100, 1920, 1080, 1)).toBeCloseTo(0, 10);
});

test('reactionDelta follow → maximal près du front de l\'onde, nul loin du front', () => {
  const reaction = { type: /** @type {const} */ ('follow'), params: { cx: 0, cy: 0 } };
  // progress=0.5 → rayon = 0.5 * diagonale ≈ point à (radius,0), pile sur le front
  const maxRadius = Math.sqrt(1920 * 1920 + 1080 * 1080);
  const radius = 0.5 * maxRadius;
  const onFront = reactionDelta(reaction, 0, radius, 0, 1920, 1080, 0.5);
  const farFromFront = reactionDelta(reaction, 0, 0, 0, 1920, 1080, 0.5); // dist=0, loin du front à mi-parcours
  expect(onFront).toBeGreaterThan(farFromFront);
  expect(onFront).toBeGreaterThan(0.4); // proche de l'amplitude max (0.5)
});

test('reactionDelta raid → nul en dehors de la bande, positif dedans', () => {
  const reaction = { type: /** @type {const} */ ('raid'), params: {} };
  // à progress=0.5, la bande est centrée sur l'écran (cssW/2 environ)
  const inBand = reactionDelta(reaction, 0, 960, 0, 1920, 1080, 0.5);
  const outOfBand = reactionDelta(reaction, 0, 1920 * 5, 0, 1920, 1080, 0.5);
  expect(inBand).toBeGreaterThan(0);
  expect(outOfBand).toBe(0);
});

test('reactionDelta bits → seuls les points dans indices reçoivent un boost', () => {
  const reaction = { type: /** @type {const} */ ('bits'), params: { indices: new Set([2, 5]) } };
  expect(reactionDelta(reaction, 2, 0, 0, 1920, 1080, 0.5)).toBeGreaterThan(0);
  expect(reactionDelta(reaction, 5, 0, 0, 1920, 1080, 0.5)).toBeGreaterThan(0);
  expect(reactionDelta(reaction, 3, 0, 0, 1920, 1080, 0.5)).toBe(0);
});

import { afterEach as afterEachPulse, test as testPulse, expect as expectPulse } from 'bun:test';
import { DotGridAnimated } from './DotGridAnimated.js';
import { createLayerHarness } from './layer-test-harness.js';

const PULSE_ORIGINALS = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
afterEachPulse(() => {
  globalThis.document = PULSE_ORIGINALS.document;
  globalThis.getComputedStyle = PULSE_ORIGINALS.getComputedStyle;
});

testPulse('[A2] changer pulseSpeed en cours de route ne fait pas sauter l’opacité des points : seul l’avenir change', () => {
  globalThis.document = /** @type {*} */ ({ createElement: () => ({ style: {}, remove() {} }), body: { appendChild() {} } });
  globalThis.getComputedStyle = /** @type {*} */ (() => ({ color: 'rgb(200, 185, 122)' }));
  const harness = createLayerHarness({ width: 400, height: 300 });
  const instance = DotGridAnimated({ reactionMode: 'none', pulseSpeed: 1 }, harness.environment);
  const firstAlpha = (calls) => Number(/,([0-9.]+)\)$/.exec(calls.find(([name, key]) => name === 'set' && key === 'fillStyle')[2])[1]);

  let previous = 0;
  for (let frame = 0; frame < 300; frame += 1) previous = firstAlpha(harness.tick(frame * 16.7));
  instance.update?.({ pulseSpeed: 2 });
  const after = firstAlpha(harness.tick(300 * 16.7));
  // Au plus : amplitude 0,18 × vitesse 1,1 × pulseSpeed 2 × 16,7 ms ≈ 0,007 ; l'ancien calcul sautait de plusieurs centièmes.
  expectPulse(Math.abs(after - previous)).toBeLessThan(0.02);
});

describe('planUpdate : ce que de nouvelles options changent dans une grille en marche', () => {
  const current = { spacing: 20, dotRadius: 2, glowIntensity: 1, reactionMode: 'ambient', reactionInterval: 10 };
  const fakeResolve = (css) => (css === '#ff0000' ? [255, 0, 0] : [0, 0, 255]);
  const plan = (opts) => planUpdate(opts, current, fakeResolve);
  const NONE = { layout: false, colors: false, glow: false, schedule: false };

  test('no option changes nothing and rebuilds nothing', () => {
    expect(plan({})).toEqual({ values: {}, stale: NONE, clearAudio: false });
  });

  test('a spacing that differs and is positive moves the layout; the same one, zero or a text does not', () => {
    expect(plan({ spacing: 30 })).toEqual({ values: { spacing: 30 }, stale: { ...NONE, layout: true }, clearAudio: false });
    for (const spacing of [20, 0, -5, '30']) expect(plan({ spacing })).toEqual({ values: {}, stale: NONE, clearAudio: false });
  });

  test('a dot radius that differs and is positive rebuilds the glow only', () => {
    expect(plan({ dotRadius: 3 })).toEqual({ values: { dotRadius: 3 }, stale: { ...NONE, glow: true }, clearAudio: false });
    for (const dotRadius of [2, 0, -1, '3']) expect(plan({ dotRadius }).values).toEqual({});
  });

  test('the glow intensity is floored at zero and rebuilds the glow only when it differs', () => {
    expect(plan({ glowIntensity: 2.5 })).toEqual({ values: { glowIntensity: 2.5 }, stale: { ...NONE, glow: true }, clearAudio: false });
    expect(plan({ glowIntensity: -3 }).values).toEqual({ glowIntensity: 0 });
    expect(plan({ glowIntensity: 1 })).toEqual({ values: {}, stale: NONE, clearAudio: false });
  });

  test('the colour mode takes only its three values', () => {
    for (const colorMode of ['flat', 'noise', 'glow']) expect(plan({ colorMode }).values).toEqual({ colorMode });
    expect(plan({ colorMode: 'rainbow' }).values).toEqual({});
  });

  test('the first colour rebuilds the ramp and the glow, the second the ramp only, both as RGB', () => {
    const a = plan({ colorA: '#ff0000' });
    expect(a.values.colorA).toEqual([255, 0, 0]);
    expect(a.stale).toEqual({ ...NONE, colors: true, glow: true });
    const b = plan({ colorB: '#0000ff' });
    expect(b.values.colorB).toEqual([0, 0, 255]);
    expect(b.stale).toEqual({ ...NONE, colors: true });
    expect(plan({ colorA: 5, colorB: null }).values).toEqual({});
  });

  test('the base opacity is held in 0..1, the pulse speed and the reaction intensity floored at 0, the angle kept as is', () => {
    expect(plan({ baseOpacity: 7 }).values.baseOpacity).toBe(1);
    expect(plan({ baseOpacity: -7 }).values.baseOpacity).toBe(0);
    expect(plan({ baseOpacity: 0.4 }).values.baseOpacity).toBe(0.4);
    expect(plan({ pulseSpeed: -2 }).values.pulseSpeed).toBe(0);
    expect(plan({ pulseSpeed: 2 }).values.pulseSpeed).toBe(2);
    expect(plan({ reactionIntensity: -2 }).values.reactionIntensity).toBe(0);
    expect(plan({ reactionIntensity: 3 }).values.reactionIntensity).toBe(3);
    expect(plan({ angle: -45 }).values.angle).toBe(-45);
  });

  test('the audio intensity accepts zero and above', () => {
    expect(plan({ audioIntensity: 0 }).values.audioIntensity).toBe(0);
    expect(plan({ audioIntensity: 2 }).values.audioIntensity).toBe(2);
    expect(plan({ audioIntensity: -1 }).values).toEqual({});
  });

  test('a new reaction mode, or a new interval of at least 1, reschedules the automatic reactions', () => {
    expect(plan({ reactionMode: 'raid' })).toEqual({ values: { reactionMode: 'raid' }, stale: { ...NONE, schedule: true }, clearAudio: false });
    expect(plan({ reactionMode: 'ambient' })).toEqual({ values: {}, stale: NONE, clearAudio: false });
    expect(plan({ reactionMode: 'bogus' }).values).toEqual({});
    expect(plan({ reactionInterval: 30 })).toEqual({ values: { reactionInterval: 30 }, stale: { ...NONE, schedule: true }, clearAudio: false });
    expect(plan({ reactionInterval: 0.2 }).values).toEqual({ reactionInterval: 1 });
    for (const reactionInterval of [10, 0, -3, '5']) expect(plan({ reactionInterval }).values).toEqual({});
  });

  test('a preset that stops being audio-reactive clears the last levels; an absent option does not', () => {
    expect(plan({ audioReactive: false }).clearAudio).toBe(true);
    expect(plan({ audioReactive: 'Non' }).clearAudio).toBe(true);
    expect(plan({ audioReactive: true }).clearAudio).toBe(false);
    expect(plan({ audioReactive: 'Oui' }).clearAudio).toBe(false);
    expect(plan({}).clearAudio).toBe(false);
  });
});

describe('update applique le plan à la grille en marche', () => {
  const SAVED = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
  afterEachPulse(() => {
    globalThis.document = SAVED.document;
    globalThis.getComputedStyle = SAVED.getComputedStyle;
  });
  const COLORS = { '#ff0000': 'rgb(255, 0, 0)', '#0000ff': 'rgb(0, 0, 255)' };
  const start = (options) => {
    let probe = '';
    globalThis.document = /** @type {*} */ ({ createElement: () => ({ style: { set cssText(value) { probe = value; } }, remove() {} }), body: { appendChild() {} } });
    globalThis.getComputedStyle = /** @type {*} */ (() => ({ color: Object.entries(COLORS).find(([css]) => probe.includes(css))?.[1] ?? 'rgb(200, 185, 122)' }));
    const harness = createLayerHarness({ width: 400, height: 300 });
    return { harness, instance: DotGridAnimated({ reactionMode: 'none', colorMode: 'flat', spacing: 40, ...options }, harness.environment) };
  };
  const dots = (calls) => calls.filter(([name]) => name === 'fill').length;
  const radii = (calls) => calls.filter(([name]) => name === 'arc').map((call) => call[3]);
  const fills = (calls) => new Set(calls.filter(([name, key]) => name === 'set' && key === 'fillStyle').map((call) => call[2].replace(/,[0-9.]+\)$/, ')')));

  test('a wider spacing rebuilds the grid with fewer dots', () => {
    const { harness, instance } = start({});
    const before = dots(harness.tick(0));
    instance.update({ spacing: 80 });
    expectPulse(dots(harness.tick(16))).toBeLessThan(before / 2);
  });

  test('a new first colour repaints the dots in it', () => {
    const { harness, instance } = start({});
    instance.update({ colorA: '#ff0000' });
    expectPulse([...fills(harness.tick(16))].every((fill) => fill.startsWith('rgba(255,0,0'))).toBe(true);
  });

  test('a new second colour shows in the noise mode only once it is given', () => {
    const { harness, instance } = start({ colorMode: 'noise', colorA: '#ff0000', colorB: '#ff0000' });
    expectPulse(fills(harness.tick(0)).size).toBe(1);
    instance.update({ colorB: '#0000ff' });
    expectPulse(fills(harness.tick(16)).size).toBeGreaterThan(1);
  });

  test('a new base opacity changes how opaque the dots are', () => {
    const { harness, instance } = start({ baseOpacity: 1, pulseSpeed: 0 });
    const alpha = (calls) => Math.max(...calls.filter(([name, key]) => name === 'set' && key === 'fillStyle').map((call) => Number(/,([0-9.]+)\)$/.exec(call[2])[1])));
    const before = alpha(harness.tick(0));
    instance.update({ baseOpacity: 0.1 });
    expectPulse(alpha(harness.tick(16))).toBeLessThan(before / 2);
  });

  test('a new angle moves the colours across the noise ramp', () => {
    const { harness, instance } = start({ colorMode: 'noise', colorA: '#ff0000', colorB: '#0000ff', angle: 0 });
    const painted = (calls) => calls.filter(([name, key]) => name === 'set' && key === 'fillStyle').map((call) => call[2]).join('|');
    const before = painted(harness.tick(0));
    instance.update({ angle: 180 });
    expectPulse(painted(harness.tick(0))).not.toBe(before);
  });

  test('a stronger glow gives a bigger sprite to the glow mode', () => {
    const { harness, instance } = start({ colorMode: 'glow', glowIntensity: 1 });
    const sizes = (calls) => calls.filter(([name]) => name === 'drawImage').map((call) => call.slice(2).join(','));
    const before = sizes(harness.tick(0));
    expectPulse(before.length).toBeGreaterThan(0);
    instance.update({ glowIntensity: 3 });
    expectPulse(sizes(harness.tick(16)).join()).not.toBe(before.join());
  });

  test('a new reaction mode or interval re-arms the timer of the automatic reactions', () => {
    const delays = [];
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = /** @type {*} */ ((_, delay) => { delays.push(delay); return 0; });
    try {
      const { instance } = start({ reactionMode: 'ambient', reactionInterval: 10 });
      expectPulse(delays.at(-1)).toBe(10_000);
      instance.update({ reactionInterval: 30 });
      expectPulse(delays.at(-1)).toBe(30_000);
      const armed = delays.length;
      instance.update({ reactionMode: 'raid' });
      expectPulse(delays.length).toBe(armed + 1);
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
  });

  test('a preset that stops being audio-reactive loses the levels it had received', () => {
    const { harness, instance } = start({ audioReactive: true });
    instance.setAudioLevel?.({ bass: 1, treble: 1 });
    const reactive = radii(harness.tick(0));
    instance.update({ audioReactive: false });
    const calm = radii(harness.tick(16));
    expectPulse(Math.max(...reactive)).toBeGreaterThan(Math.max(...calm));
  });
});
