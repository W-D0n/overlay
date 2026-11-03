import { describe, expect, test } from 'bun:test';
import { gradientLine, moveBox, moveStop, resizeBox } from './mask-geometry.js';

const box = { x: 0.2, y: 0.3, width: 0.4, height: 0.2 };

describe('moveBox', () => {
  test('moves by the delta', () => {
    expect(moveBox(box, 0.1, -0.1)).toEqual({ x: 0.30000000000000004, y: 0.19999999999999998 });
  });

  test('stays inside the frame, on every side', () => {
    expect(moveBox(box, -1, -1)).toEqual({ x: 0, y: 0 });
    expect(moveBox(box, 1, 1)).toEqual({ x: 0.6, y: 0.8 });
  });
});

describe('resizeBox', () => {
  test('an east handle moves the right edge only', () => {
    expect(resizeBox(box, 'e', 0.1, 0.5)).toEqual({ x: 0.2, y: 0.3, width: 0.5, height: 0.2 });
  });

  test('a west handle moves the left edge and keeps the right one', () => {
    const r = resizeBox(box, 'w', -0.1, 0);
    expect(r.x).toBeCloseTo(0.1, 9);
    expect(r.x + r.width).toBeCloseTo(0.6, 9);
  });

  test('a corner moves two edges', () => {
    const r = resizeBox(box, 'nw', 0.05, 0.05);
    expect(r.x).toBeCloseTo(0.25, 9);
    expect(r.y).toBeCloseTo(0.35, 9);
    expect(r.x + r.width).toBeCloseTo(0.6, 9);
    expect(r.y + r.height).toBeCloseTo(0.5, 9);
  });

  test('keeps a minimal size and stays in the frame', () => {
    expect(resizeBox(box, 'e', -5, 0).width).toBeCloseTo(0.02, 9);
    expect(resizeBox(box, 'w', 5, 0).width).toBeCloseTo(0.02, 9);
    const wide = resizeBox(box, 'se', 5, 5);
    expect(wide.x + wide.width).toBe(1);
    expect(wide.y + wide.height).toBe(1);
    expect(resizeBox(box, 'nw', -5, -5)).toMatchObject({ x: 0, y: 0 });
  });
});

describe('gradientLine', () => {
  test('0° goes up, 90° to the right, 180° down', () => {
    expect(gradientLine(0, 100, 50)).toMatchObject({ dx: 0, dy: -1, length: 50 });
    const right = gradientLine(90, 100, 50);
    expect(right.dx).toBeCloseTo(1, 9);
    expect(right.dy).toBeCloseTo(0, 9);
    expect(right.length).toBeCloseTo(100, 9);
    expect(gradientLine(180, 100, 50).dy).toBeCloseTo(1, 9);
  });

  test('a diagonal line is as long as the corner-to-corner projection', () => {
    expect(gradientLine(45, 100, 100).length).toBeCloseTo(141.42, 1);
  });
});

describe('moveStop', () => {
  const fade = { angle: 90, start: 0.4, end: 0.6 };

  test('a pointer movement along the line moves the stop by its share of the line', () => {
    expect(moveStop(fade, 'start', 10, 0, 100, 100).start).toBeCloseTo(0.5, 9);
    expect(moveStop(fade, 'end', -10, 0, 100, 100).end).toBeCloseTo(0.5, 9);
  });

  test('a movement across the line moves nothing', () => {
    expect(moveStop(fade, 'start', 0, 50, 100, 100).start).toBeCloseTo(0.4, 9);
  });

  test('start cannot pass end, end cannot pass start, both stay in 0..1', () => {
    expect(moveStop(fade, 'start', 90, 0, 100, 100).start).toBe(0.6);
    expect(moveStop(fade, 'end', -90, 0, 100, 100).end).toBe(0.4);
    expect(moveStop(fade, 'start', -90, 0, 100, 100).start).toBe(0);
    expect(moveStop(fade, 'end', 90, 0, 100, 100).end).toBe(1);
  });

  test('follows the angle', () => {
    expect(moveStop({ angle: 180, start: 0.4, end: 0.6 }, 'start', 0, 10, 100, 100).start).toBeCloseTo(0.5, 9);
  });

  test('an empty frame moves nothing', () => {
    expect(moveStop(fade, 'start', 5, 5, 0, 0)).toEqual({ start: 0.4, end: 0.6 });
  });
});
