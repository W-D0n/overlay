import { describe, expect, test } from 'bun:test';
import { RENDER_REFERENCE } from '../render-reference.js';
import { hitTestAll, marqueeHits, shownLayers } from './canvas-geometry.js';

const isIdentity = (kind) => kind === 'branding';
const placement = (x, y, width, height) => ({ x, y, width, height });
const layer = (id, box, extra = {}) => ({ id, kind: 'text', visible: true, placement: box, ...extra });
const group = (id, box, extra = {}) => ({ id, kind: 'group', visible: true, placement: box, ...extra });
const at = (px, py) => ({ x: px * RENDER_REFERENCE.width, y: py * RENDER_REFERENCE.height });
const rect = (x, y, width, height) => ({ x: x * RENDER_REFERENCE.width, y: y * RENDER_REFERENCE.height, width: width * RENDER_REFERENCE.width, height: height * RENDER_REFERENCE.height });

/** Two members far apart in a group whose box covers both and the empty space between them; one free layer behind. */
const scene = () => [
  layer('back', placement(0, 0, 1, 1)),
  layer('a', placement(0.1, 0.1, 0.2, 0.2), { group: 'g' }),
  layer('b', placement(0.7, 0.7, 0.2, 0.2), { group: 'g' }),
  group('g', placement(0.1, 0.1, 0.8, 0.8)),
];

describe('shownLayers', () => {
  test('hidden layers go, and so do the layers of a hidden group', () => {
    const layers = [layer('a', placement(0, 0, 1, 1), { group: 'g' }), layer('b', placement(0, 0, 1, 1), { visible: false }), group('g', placement(0, 0, 1, 1), { visible: false }), layer('c', placement(0, 0, 1, 1))];
    expect(shownLayers(layers).map(({ id }) => id)).toEqual(['c']);
  });

  test('a visible group keeps its members', () => {
    expect(shownLayers(scene()).map(({ id }) => id)).toEqual(['back', 'a', 'b', 'g']);
  });
});

describe('hitTestAll with groups', () => {
  test('over a member, the group comes first (it is above), then the member, then what is behind', () => {
    expect(hitTestAll(scene(), at(0.15, 0.15), isIdentity)).toEqual(['g', 'a', 'back']);
    expect(hitTestAll(scene(), at(0.8, 0.8), isIdentity)).toEqual(['g', 'b', 'back']);
  });

  test('over the empty part of the group box, the group is not hit', () => {
    expect(hitTestAll(scene(), at(0.5, 0.5), isIdentity)).toEqual(['back']);
  });

  test('a hidden member does not make its group reachable', () => {
    const layers = scene().map((entry) => (entry.id === 'a' ? { ...entry, visible: false } : entry));
    expect(hitTestAll(layers, at(0.15, 0.15), isIdentity)).toEqual(['back']);
    expect(hitTestAll(layers, at(0.8, 0.8), isIdentity)).toEqual(['g', 'b', 'back']);
  });

  test('a hidden group hides its members from the pointer', () => {
    const layers = scene().map((entry) => (entry.id === 'g' ? { ...entry, visible: false } : entry));
    expect(hitTestAll(layers, at(0.15, 0.15), isIdentity)).toEqual(['back']);
  });

  test('a scene without group is unchanged', () => {
    const layers = [layer('a', placement(0, 0, 1, 1)), layer('b', placement(0.5, 0.5, 0.5, 0.5))];
    expect(hitTestAll(layers, at(0.6, 0.6), isIdentity)).toEqual(['b', 'a']);
  });
});

describe('marqueeHits with groups', () => {
  test('a marquee touching a member selects the group, not the member', () => {
    expect(marqueeHits(scene(), rect(0.05, 0.05, 0.1, 0.1))).toEqual(['back', 'g']);
  });

  test('a marquee over the empty part of the box does not touch the group', () => {
    expect(marqueeHits(scene(), rect(0.4, 0.4, 0.1, 0.1))).toEqual(['back']);
  });

  test('a hidden group is not selected, nor its members', () => {
    const layers = scene().map((entry) => (entry.id === 'g' ? { ...entry, visible: false } : entry));
    expect(marqueeHits(layers, rect(0, 0, 1, 1))).toEqual(['back']);
  });

  test('a marquee over everything takes the group once', () => {
    expect(marqueeHits(scene(), rect(0, 0, 1, 1))).toEqual(['back', 'g']);
  });

  test('layers without a kind or a group still work as before', () => {
    const plain = [{ id: 'a', visible: true, placement: placement(0, 0, 0.5, 0.5) }, { id: 'b', visible: true, placement: placement(0.6, 0.6, 0.2, 0.2) }];
    expect(marqueeHits(plain, rect(0.1, 0.1, 0.1, 0.1))).toEqual(['a']);
  });
});
