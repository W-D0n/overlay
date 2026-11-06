import { describe, expect, test } from 'bun:test';
import { cursorFor, dragResult, pickOnDown } from './canvas-gestures.js';
import { collectTargets } from './canvas-snapping.js';

const R = (x, y, width, height) => ({ x, y, width, height });
const none = { shiftKey: false, altKey: false };
/** Targets: a vertical line at x = 500 and a horizontal one at y = 300 (and the canvas' own). */
const targets = () => ({ xs: [{ pos: 500, kind: 'layer-edge', span: [0, 100] }], ys: [{ pos: 300, kind: 'layer-edge', span: [0, 100] }] });
const snapping = (threshold = 10) => ({ targets, threshold });

describe('dragResult : déplacer', () => {
  const gesture = { type: 'move', startBox: R(100, 100, 200, 100), startRects: { a: R(100, 100, 100, 100), b: R(200, 100, 100, 100) } };

  test('toutes les couches suivent le même décalage, sans aimantation', () => {
    const result = dragResult(gesture, { dx: 30, dy: 5 }, none, null);
    expect(result.rects).toEqual({ a: R(130, 105, 100, 100), b: R(230, 105, 100, 100) });
    expect(result.guides).toEqual([]);
    expect(result.label).toBe('Déplacer');
    expect(result.readout).toBe('X 130 · Y 105');
  });

  test('Maj bloque un axe : le plus grand déplacement gagne', () => {
    const result = dragResult(gesture, { dx: 30, dy: 5 }, { shiftKey: true, altKey: false }, null);
    expect(result.rects.a).toEqual(R(130, 100, 100, 100));
    expect(result.readout).toBe('X 130 · Y 100');
  });

  test('l’aimantation ajoute le décalage qui fait coller (bord droit à 500) et rend ses repères', () => {
    const result = dragResult(gesture, { dx: 196, dy: 0 }, none, snapping());
    expect(result.rects.b.x + result.rects.b.width).toBe(500);
    expect(result.rects.a.x).toBe(300);
    expect(result.guides.length).toBeGreaterThan(0);
    expect(result.readout).toBe('X 300 · Y 100');
  });

  test('l’aimantation agit aussi sur l’axe vertical (bord bas à 300)', () => {
    const result = dragResult(gesture, { dx: 0, dy: 96 }, none, snapping());
    expect(result.rects.a.y + result.rects.a.height).toBe(300);
    expect(result.rects.a.y).toBe(200);
    expect(result.readout).toBe('X 100 · Y 200');
  });

  test('hors de portée, rien ne colle', () => {
    const result = dragResult(gesture, { dx: 150, dy: 0 }, none, snapping(10));
    expect(result.rects.a.x).toBe(250);
    expect(result.guides).toEqual([]);
  });

  test('les cibles ne sont demandées que si l’aimantation est active', () => {
    let asked = 0;
    dragResult(gesture, { dx: 1, dy: 1 }, none, { targets: () => { asked += 1; return targets(); }, threshold: 10 });
    expect(asked).toBe(1);
    dragResult(gesture, { dx: 1, dy: 1 }, none, null);
    expect(asked).toBe(1);
  });
});

describe('dragResult : redimensionner', () => {
  const gesture = { type: 'resize', handle: 'se', startBox: R(100, 100, 200, 100), startRects: { a: R(100, 100, 200, 100) } };

  test('la poignée déplace son coin ; le libellé et l’indication disent la taille', () => {
    const result = dragResult(gesture, { dx: 50, dy: 20 }, none, null);
    expect(result.rects.a).toEqual(R(100, 100, 250, 120));
    expect(result.label).toBe('Redimensionner');
    expect(result.readout).toBe('250 × 120 px');
  });

  test('plusieurs couches sont mises à l’échelle avec la boîte', () => {
    const two = { ...gesture, startRects: { a: R(100, 100, 100, 100), b: R(200, 100, 100, 100) } };
    const result = dragResult(two, { dx: 200, dy: 0 }, none, null);
    expect(result.rects.a).toEqual(R(100, 100, 200, 100));
    expect(result.rects.b).toEqual(R(300, 100, 200, 100));
  });

  test('Maj garde les proportions, Alt part du centre', () => {
    const ratio = dragResult(gesture, { dx: 100, dy: 0 }, { shiftKey: true, altKey: false }, null);
    expect(ratio.rects.a.width / ratio.rects.a.height).toBeCloseTo(2, 5);
    const center = dragResult(gesture, { dx: 20, dy: 10 }, { shiftKey: false, altKey: true }, null);
    expect(center.rects.a.x).toBe(80);
    expect(center.rects.a.y).toBe(90);
  });

  test('l’aimantation colle le bord déplacé (500) ; elle est coupée par Maj et par Alt', () => {
    const snapped = dragResult(gesture, { dx: 196, dy: 0 }, none, snapping());
    expect(snapped.rects.a.x + snapped.rects.a.width).toBe(500);
    expect(snapped.guides.length).toBeGreaterThan(0);
    const shift = dragResult(gesture, { dx: 196, dy: 0 }, { shiftKey: true, altKey: false }, snapping());
    expect(shift.guides).toEqual([]);
    const alt = dragResult(gesture, { dx: 196, dy: 0 }, { shiftKey: false, altKey: true }, snapping());
    expect(alt.guides).toEqual([]);
    expect(alt.rects.a.x + alt.rects.a.width).not.toBe(500);
  });

  test('les cibles ne sont demandées que quand l’aimantation s’applique', () => {
    let asked = 0;
    const counting = { targets: () => { asked += 1; return targets(); }, threshold: 10 };
    dragResult(gesture, { dx: 1, dy: 1 }, { shiftKey: true, altKey: false }, counting);
    dragResult(gesture, { dx: 1, dy: 1 }, { shiftKey: false, altKey: true }, counting);
    expect(asked).toBe(0);
    dragResult(gesture, { dx: 1, dy: 1 }, none, counting);
    expect(asked).toBe(1);
  });

  test('avec de vraies cibles de la toile, le centre colle', () => {
    const real = { targets: () => collectTargets({ canvas: { width: 1920, height: 1080 }, others: [] }), threshold: 10 };
    const wide = { type: 'resize', handle: 'e', startBox: R(0, 0, 900, 100), startRects: { a: R(0, 0, 900, 100) } };
    const result = dragResult(wide, { dx: 55, dy: 0 }, none, real);
    expect(result.rects.a.width).toBe(960);
  });
});

describe('pickOnDown', () => {
  test('le plus haut est visé ; non sélectionné, il remplace la sélection', () => {
    expect(pickOnDown({ hits: ['top', 'low'], selection: [], altKey: false, shiftKey: false })).toEqual({ hit: 'top', select: { ids: ['top'], mode: 'replace' } });
    expect(pickOnDown({ hits: ['top'], selection: ['other'], altKey: false, shiftKey: false })).toEqual({ hit: 'top', select: { ids: ['top'], mode: 'replace' } });
  });

  test('déjà sélectionné, il garde la sélection (on glisse tout)', () => {
    expect(pickOnDown({ hits: ['a', 'b'], selection: ['a', 'b'], altKey: false, shiftKey: false })).toEqual({ hit: 'a', select: null });
  });

  test('Maj bascule la couche dans la sélection', () => {
    expect(pickOnDown({ hits: ['a'], selection: ['a'], altKey: false, shiftKey: true })).toEqual({ hit: 'a', select: { ids: ['a'], mode: 'toggle' } });
    expect(pickOnDown({ hits: ['a'], selection: [], altKey: false, shiftKey: true })).toEqual({ hit: 'a', select: { ids: ['a'], mode: 'toggle' } });
  });

  test('rien sous le pointeur : aucune couche, aucun changement', () => {
    expect(pickOnDown({ hits: [], selection: ['a'], altKey: false, shiftKey: false })).toEqual({ hit: null, select: null });
    expect(pickOnDown({ hits: [], selection: ['a'], altKey: true, shiftKey: false })).toEqual({ hit: null, select: null });
  });

  test('Alt vise la couche juste en dessous de la sélectionnée à cet endroit, et s’arrête au fond', () => {
    expect(pickOnDown({ hits: ['a', 'b', 'c'], selection: ['a'], altKey: true, shiftKey: false })).toEqual({ hit: 'b', select: { ids: ['b'], mode: 'replace' } });
    expect(pickOnDown({ hits: ['a', 'b', 'c'], selection: ['b'], altKey: true, shiftKey: false }).hit).toBe('c');
    expect(pickOnDown({ hits: ['a', 'b', 'c'], selection: ['c'], altKey: true, shiftKey: false }).hit).toBe('c');
  });

  test('Alt remplace la sélection par la couche du dessous, même si elle faisait déjà partie d’une sélection multiple', () => {
    expect(pickOnDown({ hits: ['a', 'b'], selection: ['a', 'b'], altKey: true, shiftKey: false })).toEqual({ hit: 'b', select: { ids: ['b'], mode: 'replace' } });
  });

  test('Alt sans sélection ici vise la plus haute, et la sélectionne même si elle l’était', () => {
    expect(pickOnDown({ hits: ['a', 'b'], selection: ['z'], altKey: true, shiftKey: false })).toEqual({ hit: 'a', select: { ids: ['a'], mode: 'replace' } });
  });
});

describe('cursorFor', () => {
  test('la main pendant Espace l’emporte sur tout', () => {
    expect(cursorFor({ spaceDown: true, handle: 'nw', overMovable: true })).toBe('grab');
  });

  test('une poignée donne sa flèche, une couche sélectionnée mobile la croix, le reste la flèche', () => {
    expect(cursorFor({ spaceDown: false, handle: 'nw', overMovable: true })).toBe('nwse-resize');
    expect(cursorFor({ spaceDown: false, handle: 'e', overMovable: false })).toBe('ew-resize');
    expect(cursorFor({ spaceDown: false, handle: null, overMovable: true })).toBe('move');
    expect(cursorFor({ spaceDown: false, handle: null, overMovable: false })).toBe('default');
  });
});
