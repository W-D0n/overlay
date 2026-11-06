import { describe, expect, test } from 'bun:test';
import { DEFAULT_MASKS, MASK_SHAPES, canonicalMask, maskCss, maskErrors, setMask } from './layer-mask.js';

const box = (extra = {}) => ({ shape: 'rectangle', x: 0.1, y: 0.2, width: 0.5, height: 0.4, feather: 0, ...extra });
const linear = (extra = {}) => ({ shape: 'linear', angle: 90, start: 0.4, end: 0.6, ...extra });

describe('maskErrors', () => {
  test('a valid mask of each shape has no defect; absent is valid', () => {
    expect(maskErrors('m', undefined)).toEqual([]);
    for (const { id } of MASK_SHAPES) expect(maskErrors('m', DEFAULT_MASKS[id])).toEqual([]);
  });

  test('not an object, unknown shape, missing or non-numeric field, bad invert', () => {
    expect(maskErrors('m', 3)[0]).toContain('objet');
    expect(maskErrors('m', [])[0]).toContain('objet');
    expect(maskErrors('m', { shape: 'star' })[0]).toContain('forme');
    expect(maskErrors('m', box({ x: 'a' }))[0]).toContain('m.x');
    expect(maskErrors('m', box({ width: Number.NaN }))[0]).toContain('m.width');
    expect(maskErrors('m', linear({ angle: undefined }))[0]).toContain('m.angle');
    expect(maskErrors('m', box({ invert: false }))[0]).toContain('m.invert');
  });

  test('the fields of the other shape are not asked for', () => {
    expect(maskErrors('m', { shape: 'linear', angle: 0, start: 0, end: 1 })).toEqual([]);
    expect(maskErrors('m', { shape: 'ellipse', x: 0, y: 0, width: 1, height: 1, feather: 0 })).toEqual([]);
  });
});

describe('canonicalMask', () => {
  test('values are bounded and rounded to the thousandth', () => {
    expect(canonicalMask(box({ x: -1, y: 5, width: 0, height: 9, feather: 3 }))).toEqual(box({ x: 0, y: 1, width: 0.02, height: 1, feather: 1 }));
    expect(canonicalMask(box({ x: 0.123456 })).x).toBe(0.123);
    expect(canonicalMask(linear({ angle: 999 })).angle).toBe(180);
  });

  test('the fields of another shape are dropped', () => {
    expect(canonicalMask({ ...box(), angle: 3, start: 0 })).toEqual(box());
    expect(canonicalMask({ ...linear(), x: 1, feather: 1 })).toEqual(linear());
  });

  test('invert is kept only when on', () => {
    expect(canonicalMask(box({ invert: true })).invert).toBe(true);
    expect('invert' in canonicalMask(box())).toBe(false);
  });

  test('a fade whose end comes before its start is closed up to a hard edge', () => {
    expect(canonicalMask(linear({ start: 0.7, end: 0.2 }))).toEqual(linear({ start: 0.7, end: 0.7 }));
  });

  test('a mask that shows everything is not written; inverted or a fade, it stays', () => {
    expect(canonicalMask(box({ x: 0, y: 0, width: 1, height: 1, feather: 0 }))).toBeUndefined();
    expect(canonicalMask(box({ x: 0, y: 0, width: 1, height: 1, feather: 0.5 }))).toBeUndefined();
    expect(canonicalMask(box({ x: 0, y: 0, width: 1, height: 1, invert: true }))).toBeDefined();
    expect(canonicalMask(linear({ start: 0, end: 1 }))).toBeDefined();
  });

  test('an invalid mask is left as it is, for validation to refuse', () => {
    const bad = { shape: 'star' };
    expect(canonicalMask(bad)).toBe(bad);
    expect(canonicalMask(7)).toBe(7);
  });

  test('the canonical form is stable', () => {
    for (const mask of [box({ feather: 0.25 }), linear({ invert: true }), { ...DEFAULT_MASKS.ellipse }]) expect(canonicalMask(canonicalMask(mask))).toEqual(canonicalMask(mask));
  });
});

describe('setMask', () => {
  test('null removes it', () => {
    expect(setMask(box(), null)).toBeUndefined();
    expect(setMask(undefined, null)).toBeUndefined();
  });

  test('choosing a shape from nothing starts from the default of that shape', () => {
    expect(setMask(undefined, { shape: 'ellipse' })).toEqual(DEFAULT_MASKS.ellipse);
    expect(setMask(undefined, { shape: 'linear' })).toEqual(DEFAULT_MASKS.linear);
  });

  test('a change of a field completes the mask the layer already has', () => {
    expect(setMask(box({ feather: 0.3 }), { width: 0.9 })).toEqual(box({ feather: 0.3, width: 0.9 }));
  });

  test('another shape starts from that shape default but keeps invert', () => {
    expect(setMask(box({ invert: true, x: 0.5 }), { shape: 'linear' })).toEqual({ ...DEFAULT_MASKS.linear, invert: true });
  });

  test('invert turns on and off', () => {
    expect(setMask(box(), { invert: true }).invert).toBe(true);
    expect('invert' in setMask(box({ invert: true }), { invert: undefined })).toBe(false);
  });

  test('a change is bounded', () => {
    expect(setMask(box(), { x: 7 }).x).toBe(1);
  });
});

describe('maskCss', () => {
  test('no mask, no CSS', () => {
    expect(maskCss(undefined)).toEqual({ image: '', composite: '' });
  });

  test('a linear fade: visible at the start, hidden at the end, along the angle', () => {
    expect(maskCss(linear())).toEqual({ image: 'linear-gradient(90deg, #000 40%, transparent 60%)', composite: '' });
    expect(maskCss(linear({ invert: true, angle: -45 })).image).toBe('linear-gradient(-45deg, transparent 40%, #000 60%)');
  });

  test('an ellipse: radii are half the box, centered on it, soft from 1 - feather', () => {
    expect(maskCss({ shape: 'ellipse', x: 0.1, y: 0.2, width: 0.6, height: 0.4, feather: 0.25 })).toEqual({
      image: 'radial-gradient(ellipse 30% 20% at 40% 40%, #000 75%, transparent 100%)',
      composite: '',
    });
    expect(maskCss({ shape: 'ellipse', x: 0, y: 0, width: 1, height: 1, feather: 0, invert: true }).image).toBe('radial-gradient(ellipse 50% 50% at 50% 50%, transparent 100%, #000 100%)');
  });

  test('a rectangle: two fades across and down, kept where both show', () => {
    const css = maskCss(box());
    expect(css.composite).toBe('intersect');
    expect(css.image).toBe('linear-gradient(to right, transparent 10%, #000 10%, #000 60%, transparent 60%), linear-gradient(to bottom, transparent 20%, #000 20%, #000 60%, transparent 60%)');
  });

  test('a rectangle with soft edges fades over its feather share of each half side', () => {
    const css = maskCss(box({ x: 0, y: 0, width: 0.5, height: 0.5, feather: 0.5 }));
    expect(css.image.startsWith('linear-gradient(to right, transparent 0%, #000 12.5%, #000 37.5%, transparent 50%)')).toBe(true);
  });

  test('an inverted rectangle shows where either fade is hidden: the layers are added', () => {
    const css = maskCss(box({ invert: true }));
    expect(css.composite).toBe('add');
    expect(css.image.startsWith('linear-gradient(to right, #000 10%, transparent 10%, transparent 60%, #000 60%)')).toBe(true);
  });
});
