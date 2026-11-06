import { describe, expect, test } from 'bun:test';
import { animatedFilters } from './layer-filters.js';
import { FILTER_TARGETS, filterBase, isTargetId, targetRange } from './layer-bindings.js';
import { changeKey, sampleKeys, setKey } from './layer-timeline.js';
import { validateSceneDoc } from '../scene/scene-doc.js';

describe('animatedFilters', () => {
  test('a driven color setting replaces the layer own and keeps the others', () => {
    expect(animatedFilters({ brightness: 1.5, hue: 30 }, { brightness: 0.5 })).toEqual({ brightness: 0.5, hue: 30 });
  });

  test('a driven neutral value is dropped, and nothing left is undefined', () => {
    expect(animatedFilters({ brightness: 1.5 }, { brightness: 1 })).toBeUndefined();
    expect(animatedFilters(undefined, { hue: 0 })).toBeUndefined();
  });

  test('driven values are bounded', () => {
    expect(animatedFilters(undefined, { brightness: 9, hue: -999 })).toEqual({ brightness: 2, hue: -180 });
  });

  test('a driven glow intensity sets the halo of the layer, or the starting halo', () => {
    expect(animatedFilters({ glow: { color: '#ff0000', size: 10, intensity: 1 } }, { glow: 0.4 }).glow).toEqual({ color: '#ff0000', size: 10, intensity: 0.4 });
    expect(animatedFilters(undefined, { glow: 0.5 }).glow).toMatchObject({ color: '#C8B97A'.toLowerCase(), intensity: 0.5 });
  });

  test('a driven glow at zero turns the halo off', () => {
    expect(animatedFilters({ glow: { color: '#ff0000', size: 10, intensity: 1 } }, { glow: 0 })).toBeUndefined();
  });

  test('nothing driven leaves the filters as they are', () => {
    const filters = { saturation: 2 };
    expect(animatedFilters(filters, {})).toEqual(filters);
  });
});

describe('filter targets', () => {
  test('each one is a target with bounds that contain its start and its end', () => {
    for (const [id, range] of Object.entries(FILTER_TARGETS)) {
      expect(isTargetId(id)).toBe(true);
      expect(targetRange(id, null)).toBe(range);
      expect(range.from).toBeGreaterThanOrEqual(range.min);
      expect(range.to).toBeLessThanOrEqual(range.max);
    }
  });

  test('filterBase is the layer setting, or the neutral value', () => {
    expect(filterBase({}, 'filter:brightness')).toBe(1);
    expect(filterBase({ filters: { brightness: 1.4 } }, 'filter:brightness')).toBe(1.4);
    expect(filterBase({}, 'filter:hue')).toBe(0);
    expect(filterBase({}, 'filter:glow')).toBe(0);
    expect(filterBase({ filters: { glow: { color: '#ffffff', size: 4, intensity: 0.3 } } }, 'filter:glow')).toBe(0.3);
    expect(filterBase({}, 'opacity')).toBeNull();
  });
});

describe('a scene document with driven filters', () => {
  const doc = (extra) => ({ version: 1, id: 's', name: 's', layers: [{ id: 'a', kind: 'text', visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: {}, ...extra }] });

  test('a track and a binding on a filter are valid', () => {
    expect(validateSceneDoc(doc({ timeline: [{ target: 'filter:hue', keys: [{ t: 0, v: 0, ease: 'linear' }, { t: 1000, v: 90, ease: 'linear' }] }] })).ok).toBe(true);
    expect(validateSceneDoc(doc({ bindings: [{ source: 'audio', target: 'filter:glow', from: 0, to: 1, durationMs: 100 }] })).ok).toBe(true);
  });

  test('an unknown filter is refused', () => {
    expect(validateSceneDoc(doc({ timeline: [{ target: 'filter:nope', keys: [] }] })).ok).toBe(false);
  });

  test('sampling a hue track gives the value in between', () => {
    expect(sampleKeys([{ t: 0, v: 0, ease: 'linear' }, { t: 1000, v: 90, ease: 'linear' }], 500)).toBe(45);
  });
});

describe('timeline keys on a filter', () => {
  test('a key is bounded by the range of its filter, without the layer', () => {
    const tracks = setKey([], 'filter:brightness', 0, 9);
    expect(tracks[0].keys[0].v).toBe(2);
    expect(changeKey(tracks, 'filter:brightness', 0, { v: -3 }).tracks[0].keys[0].v).toBe(0);
  });
});
