import { describe, expect, test } from 'bun:test';
import { collectTargets, snapMove, snapResize } from './canvas-snapping.js';

const R = (x, y, width, height) => ({ x, y, width, height });
const CANVAS = { width: 1920, height: 1080 };

describe('collectTargets', () => {
  test('la toile : bords et centre sur chaque axe ; marges de sécurité si demandées', () => {
    const plain = collectTargets({ canvas: CANVAS, others: [] });
    expect(plain.xs.map((t) => t.pos)).toEqual([0, 960, 1920]);
    expect(plain.ys.map((t) => t.pos)).toEqual([0, 540, 1080]);
    const margins = collectTargets({ canvas: CANVAS, others: [], margin: 96 });
    expect(margins.xs.filter((t) => t.kind === 'margin').map((t) => t.pos)).toEqual([96, 1824]);
    expect(margins.ys.filter((t) => t.kind === 'margin').map((t) => t.pos)).toEqual([96, 984]);
  });

  test('chaque autre couche apporte ses bords et son centre', () => {
    const targets = collectTargets({ canvas: CANVAS, others: [R(100, 200, 300, 100)] });
    expect(targets.xs.filter((t) => t.kind.startsWith('layer')).map((t) => t.pos)).toEqual([100, 250, 400]);
    expect(targets.ys.filter((t) => t.kind.startsWith('layer')).map((t) => t.pos)).toEqual([200, 250, 300]);
  });
});

describe('snapMove', () => {
  const targets = collectTargets({ canvas: CANVAS, others: [R(1000, 600, 200, 100)] });

  test('une boîte proche du bord gauche colle à 0 ; son décalage est le minimum nécessaire', () => {
    const result = snapMove(R(6, 400, 200, 100), targets, 10);
    expect(result.dx).toBe(-6);
    expect(result.guides.some((g) => g.axis === 'x' && g.pos === 0 && g.kind === 'canvas-edge')).toBe(true);
  });

  test('par son centre : une boîte à peu près centrée sur la toile colle au centre, et le repère est tracé', () => {
    const result = snapMove(R(865, 100, 200, 100), targets, 10);
    expect(865 + result.dx + 100).toBe(960);
    expect(result.guides.find((g) => g.pos === 960)?.kind).toBe('canvas-center');
  });

  test('par son bord droit sur le bord d’une autre couche ; plusieurs axes à la fois', () => {
    const result = snapMove(R(795, 505, 200, 100), targets, 10);
    expect(795 + result.dx + 200).toBe(1000);
    expect(505 + result.dy + 100).toBe(600);
    expect(result.guides.filter((g) => g.kind === 'layer-edge')).toHaveLength(2);
  });

  test('hors seuil, rien ne colle et aucun repère n’est tracé', () => {
    expect(snapMove(R(400, 300, 200, 100), targets, 10)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  test('le seuil est strict : juste au-delà, pas d’aimant', () => {
    expect(snapMove(R(11, 300, 200, 100), targets, 10).dx).toBe(0);
    expect(snapMove(R(10, 300, 200, 100), targets, 10).dx).toBe(-10);
  });

  test('le repère couvre la boîte et la cible', () => {
    const result = snapMove(R(1000, 300, 200, 100), targets, 10);
    const guide = result.guides.find((g) => g.axis === 'x' && g.pos === 1000);
    expect(guide.from).toBeLessThanOrEqual(300);
    expect(guide.to).toBeGreaterThanOrEqual(700);
  });

  test('plusieurs cibles à portée : la plus proche l’emporte', () => {
    const near = collectTargets({ canvas: CANVAS, others: [R(105, 0, 50, 50), R(112, 0, 50, 50)] });
    // Bords et centre de la boîte : 100, 120, 140. Candidats à portée : +5 (105), +10 (130), -3 (137, centre de la seconde) : le plus petit gagne.
    expect(snapMove(R(100, 700, 40, 40), near, 20).dx).toBe(-3);
  });
});

describe('snapResize', () => {
  const targets = collectTargets({ canvas: CANVAS, others: [] });

  test('seul le bord déplacé colle, l’opposé reste', () => {
    expect(snapResize(R(100, 100, 1815, 300), 'e', targets, 10).box).toEqual(R(100, 100, 1820, 300));
    const west = snapResize(R(4, 100, 400, 300), 'w', targets, 10);
    expect(west.box).toEqual(R(0, 100, 404, 300));
    expect(west.box.x + west.box.width).toBe(404);
  });

  test('un angle colle sur les deux axes', () => {
    const result = snapResize(R(100, 100, 1818, 976), 'se', targets, 10);
    expect(result.box.x + result.box.width).toBe(1920);
    expect(result.box.y + result.box.height).toBe(1080);
    expect(result.guides).toHaveLength(2);
  });

  test('un bord que la poignée ne déplace pas n’est pas aimanté, même proche d’une cible', () => {
    expect(snapResize(R(3, 100, 400, 300), 'e', targets, 10).box.x).toBe(3);
  });
});
