import { describe, expect, test } from 'bun:test';
import { fitImage, placementForImage } from './image-fit.js';

describe('fitImage', () => {
  const wide = { width: 400, height: 200 };
  const box = { width: 100, height: 100 };

  test('contenir : toute l’image est visible, sans déformation, centrée', () => {
    expect(fitImage('contain', wide, box)).toEqual({ sx: 0, sy: 0, sw: 400, sh: 200, dx: 0, dy: 25, dw: 100, dh: 50 });
    expect(fitImage('contain', { width: 200, height: 400 }, box)).toEqual({ sx: 0, sy: 0, sw: 200, sh: 400, dx: 25, dy: 0, dw: 50, dh: 100 });
  });

  test('couvrir : la zone est remplie, la part visible de l’image est centrée et a le rapport de la zone', () => {
    expect(fitImage('cover', wide, box)).toEqual({ sx: 100, sy: 0, sw: 200, sh: 200, dx: 0, dy: 0, dw: 100, dh: 100 });
    expect(fitImage('cover', { width: 200, height: 400 }, box)).toEqual({ sx: 0, sy: 100, sw: 200, sh: 200, dx: 0, dy: 0, dw: 100, dh: 100 });
  });

  test('étirer : toute l’image sur toute la zone', () => {
    expect(fitImage('fill', wide, box)).toEqual({ sx: 0, sy: 0, sw: 400, sh: 200, dx: 0, dy: 0, dw: 100, dh: 100 });
  });

  test('une image ou une zone sans surface ne donne rien', () => {
    expect(fitImage('contain', { width: 0, height: 10 }, box)).toBeNull();
    expect(fitImage('cover', wide, { width: 100, height: 0 })).toBeNull();
    expect(fitImage('fill', wide, { width: -3, height: 5 })).toBeNull();
  });

  test('une image au rapport de la zone n’est ni rognée ni marginée, quel que soit le cadrage', () => {
    for (const mode of ['contain', 'cover', 'fill']) {
      expect(fitImage(mode, { width: 50, height: 50 }, box)).toEqual({ sx: 0, sy: 0, sw: 50, sh: 50, dx: 0, dy: 0, dw: 100, dh: 100 });
    }
  });
});

describe('placementForImage', () => {
  const canvas = { width: 1920, height: 1080 };

  test('une petite image garde sa taille naturelle, centrée', () => {
    const placement = placementForImage({ width: 480, height: 270 }, canvas);
    expect(placement).toEqual({ x: 0.375, y: 0.375, width: 0.25, height: 0.25 });
  });

  test('une grande image est ramenée à 80 % de la toile sans se déformer, centrée', () => {
    const placement = placementForImage({ width: 3840, height: 2160 }, canvas);
    expect(placement.width).toBeCloseTo(0.8, 6);
    expect(placement.height).toBeCloseTo(0.8, 6);
    expect(placement.x).toBeCloseTo(0.1, 6);
    expect((placement.width * 1920) / (placement.height * 1080)).toBeCloseTo(3840 / 2160, 6);
  });

  test('une image très haute est limitée par la hauteur, une très large par la largeur', () => {
    const tall = placementForImage({ width: 1000, height: 4000 }, canvas);
    expect(tall.height).toBeCloseTo(0.8, 6);
    expect(tall.width * 1920).toBeCloseTo(0.8 * 1080 * 0.25, 6);
    const wide = placementForImage({ width: 8000, height: 1000 }, canvas);
    expect(wide.width).toBeCloseTo(0.8, 6);
  });
});
