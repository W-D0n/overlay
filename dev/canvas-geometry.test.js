import { describe, expect, test } from 'bun:test';
import { RENDER_REFERENCE } from '../render-reference.js';
import {
  HANDLES, HANDLE_CURSORS, MIN_SIZE_PX, fromPixelRect, handlePoints, hitTest, hitTestAll, marqueeHits, moveRect, rectBetween, resizeRect, scaleRectsWithin, toPixelRect, unionRect,
} from './canvas-geometry.js';

const R = (x, y, width, height) => ({ x, y, width, height });
const isIdentity = (kind) => kind === 'branding';
const layer = (id, placement, over = {}) => ({ id, kind: 'rain', visible: true, placement, ...over });

describe('pont fractions ↔ pixels de la source', () => {
  test('aller-retour exact', () => {
    const placement = { x: 0.25, y: 0.5, width: 0.5, height: 0.25 };
    expect(toPixelRect(placement)).toEqual(R(RENDER_REFERENCE.width / 4, RENDER_REFERENCE.height / 2, RENDER_REFERENCE.width / 2, RENDER_REFERENCE.height / 4));
    expect(fromPixelRect(toPixelRect(placement))).toEqual(placement);
  });
});

describe('hitTest', () => {
  const layers = [
    layer('fond', { x: 0, y: 0, width: 1, height: 1 }),
    layer('coin', { x: 0.5, y: 0.5, width: 0.5, height: 0.5 }),
    layer('marque', { x: 0.4, y: 0.4, width: 0.3, height: 0.3 }, { kind: 'branding' }),
  ];
  const at = (px, py) => ({ x: px * RENDER_REFERENCE.width, y: py * RENDER_REFERENCE.height });

  test('la couche la plus haute sous le pointeur ; le branding, monté au-dessus des effets, passe d’abord', () => {
    expect(hitTest(layers, at(0.1, 0.1), isIdentity)).toBe('fond');
    expect(hitTest(layers, at(0.9, 0.9), isIdentity)).toBe('coin');
    expect(hitTest(layers, at(0.55, 0.55), isIdentity)).toBe('marque');
  });

  test('un branding qui recouvre toute la toile ne vole pas les clics ; il les reçoit dès qu’il est plus petit', () => {
    const full = layers.map((l) => (l.id === 'marque' ? { ...l, placement: { x: 0, y: 0, width: 1, height: 1 } } : l));
    expect(hitTest(full, at(0.55, 0.55), isIdentity)).toBe('coin');
    expect(hitTest(full, at(0.1, 0.1), isIdentity)).toBe('fond');
  });

  test('hitTestAll liste toutes les couches sous le point, de la plus haute à la plus basse', () => {
    expect(hitTestAll(layers, at(0.55, 0.55), isIdentity)).toEqual(['marque', 'coin', 'fond']);
    expect(hitTestAll(layers, at(0.1, 0.1), isIdentity)).toEqual(['fond']);
  });

  test('une couche masquée est transparente au pointeur ; hors de toute couche : null', () => {
    const hidden = layers.map((l) => (l.id === 'coin' ? { ...l, visible: false } : l));
    expect(hitTest(hidden, at(0.9, 0.9), isIdentity)).toBe('fond');
    expect(hitTest([layer('a', { x: 0.1, y: 0.1, width: 0.1, height: 0.1 })], at(0.9, 0.9), isIdentity)).toBeNull();
  });
});

describe('sélection au rectangle', () => {
  const layers = [layer('a', { x: 0, y: 0, width: 0.2, height: 0.2 }), layer('b', { x: 0.5, y: 0.5, width: 0.2, height: 0.2 }), layer('c', { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, { visible: false })];

  test('toute couche visible que le rectangle touche, même en partie', () => {
    const marquee = R(0, 0, RENDER_REFERENCE.width * 0.25, RENDER_REFERENCE.height * 0.25);
    expect(marqueeHits(layers, marquee)).toEqual(['a']);
    expect(marqueeHits(layers, R(0, 0, RENDER_REFERENCE.width, RENDER_REFERENCE.height))).toEqual(['a', 'b']);
  });

  test('un rectangle qui ne fait que toucher un bord ne sélectionne pas', () => {
    expect(marqueeHits(layers, R(RENDER_REFERENCE.width * 0.2, 0, 50, 50))).toEqual([]);
  });

  test('rectBetween normalise dans tous les sens ; unionRect englobe', () => {
    expect(rectBetween({ x: 10, y: 50 }, { x: 4, y: 20 })).toEqual(R(4, 20, 6, 30));
    expect(unionRect([R(0, 0, 10, 10), R(20, 5, 10, 30)])).toEqual(R(0, 0, 30, 35));
  });
});

describe('déplacer', () => {
  test('translation ; avec Maj, seul l’axe dominant bouge', () => {
    expect(moveRect(R(10, 10, 100, 50), 30, -5)).toEqual(R(40, 5, 100, 50));
    expect(moveRect(R(10, 10, 100, 50), 30, -5, { lockAxis: true })).toEqual(R(40, 10, 100, 50));
    expect(moveRect(R(10, 10, 100, 50), 3, -50, { lockAxis: true })).toEqual(R(10, -40, 100, 50));
  });
});

describe('redimensionner', () => {
  const start = R(100, 100, 400, 200);

  test('chaque poignée déplace ses bords et laisse les opposés', () => {
    expect(resizeRect(start, 'e', 50, 999)).toEqual(R(100, 100, 450, 200));
    expect(resizeRect(start, 'w', 50, 999)).toEqual(R(150, 100, 350, 200));
    expect(resizeRect(start, 's', 999, 40)).toEqual(R(100, 100, 400, 240));
    expect(resizeRect(start, 'n', 999, 40)).toEqual(R(100, 140, 400, 160));
    expect(resizeRect(start, 'se', 10, 20)).toEqual(R(100, 100, 410, 220));
    expect(resizeRect(start, 'nw', 10, 20)).toEqual(R(110, 120, 390, 180));
    expect(resizeRect(start, 'ne', 10, 20)).toEqual(R(100, 120, 410, 180));
    expect(resizeRect(start, 'sw', 10, 20)).toEqual(R(110, 100, 390, 220));
  });

  test('jamais sous la taille minimale ni retournée, quelle que soit l’amplitude', () => {
    const squeezed = resizeRect(start, 'e', -5000, 0);
    expect(squeezed.width).toBe(MIN_SIZE_PX);
    expect(squeezed.x).toBe(100);
    const west = resizeRect(start, 'w', 5000, 0);
    expect(west.width).toBe(MIN_SIZE_PX);
    expect(west.x + west.width).toBe(500);
  });

  test('depuis le centre (Alt) : le centre ne bouge pas, la taille varie des deux côtés', () => {
    const grown = resizeRect(start, 'e', 50, 0, { fromCenter: true });
    expect(grown).toEqual(R(50, 100, 500, 200));
    const corner = resizeRect(start, 'se', 10, 10, { fromCenter: true });
    expect(corner.x + corner.width / 2).toBe(300);
    expect(corner.y + corner.height / 2).toBe(200);
  });

  test('proportions liées : un angle garde le rapport du départ, en suivant le mouvement dominant', () => {
    const grown = resizeRect(start, 'se', 100, 5, { keepRatio: true });
    expect(grown.width / grown.height).toBeCloseTo(2, 9);
    expect(grown.width).toBe(500);
    const tall = resizeRect(start, 'se', 5, 100, { keepRatio: true });
    expect(tall.width / tall.height).toBeCloseTo(2, 9);
    expect(tall.height).toBe(300);
  });

  test('proportions liées sur un bord : l’autre dimension varie autour de son milieu', () => {
    const wider = resizeRect(start, 'e', 100, 0, { keepRatio: true });
    expect(wider.width).toBe(500);
    expect(wider.height).toBe(250);
    expect(wider.y + wider.height / 2).toBe(200);
    const taller = resizeRect(start, 'n', 0, -60, { keepRatio: true });
    expect(taller.height).toBe(260);
    expect(taller.width).toBe(520);
    expect(taller.x + taller.width / 2).toBe(300);
    expect(taller.y).toBe(40);
  });

  test('proportions liées jusqu’au plancher : le rapport tient encore', () => {
    const tiny = resizeRect(start, 'se', -5000, -5000, { keepRatio: true });
    expect(tiny.width / tiny.height).toBeCloseTo(2, 9);
    expect(Math.min(tiny.width, tiny.height)).toBeGreaterThanOrEqual(MIN_SIZE_PX - 1e-9);
  });

  test('un rectangle sans surface ne produit ni NaN ni division par zéro avec proportions liées', () => {
    const result = resizeRect(R(0, 0, 0, 0), 'se', 10, 10, { keepRatio: true });
    expect(Number.isFinite(result.width) && Number.isFinite(result.height)).toBe(true);
  });
});

describe('groupe', () => {
  test('redimensionner la boîte englobante met à l’échelle position et taille de chaque couche', () => {
    const rects = { a: R(0, 0, 100, 100), b: R(100, 50, 100, 50) };
    const result = scaleRectsWithin(R(0, 0, 200, 100), R(0, 0, 400, 100), rects);
    expect(result.a).toEqual(R(0, 0, 200, 100));
    expect(result.b).toEqual(R(200, 50, 200, 50));
  });

  test('une boîte de départ sans largeur ni hauteur ne divise pas par zéro', () => {
    const result = scaleRectsWithin(R(5, 5, 0, 0), R(5, 5, 10, 10), { a: R(5, 5, 0, 0) });
    expect(Number.isFinite(result.a.x)).toBe(true);
  });
});

describe('poignées', () => {
  test('huit poignées, chacune avec son curseur ; points aux bords et au milieu', () => {
    expect(HANDLES).toHaveLength(8);
    for (const handle of HANDLES) expect(HANDLE_CURSORS[handle]).toMatch(/resize$/);
    const points = handlePoints(R(0, 0, 100, 50));
    expect(points.nw).toEqual({ x: 0, y: 0 });
    expect(points.e).toEqual({ x: 100, y: 25 });
    expect(points.s).toEqual({ x: 50, y: 50 });
  });
});
