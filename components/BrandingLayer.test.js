// @ts-check
import { expect, test } from 'bun:test';
import { DEFAULT_BRANDING } from '../branding-format.js';
import { BRANDING_REFERENCE_HEIGHT, brandingScale } from './BrandingLayer.js';

test('1. le canvas de référence ne change pas l’échelle', () => {
  expect(brandingScale(BRANDING_REFERENCE_HEIGHT)).toBe(1);
  expect(BRANDING_REFERENCE_HEIGHT).toBe(1080);
});

test('2. un canvas plus petit réduit proportionnellement', () => {
  expect(brandingScale(540)).toBeCloseTo(0.5, 5);
});

test('3. un canvas plus grand agrandit proportionnellement', () => {
  expect(brandingScale(2160)).toBeCloseTo(2, 5);
});

test('5. les tailles par défaut gardent la proportion historique (36 et 18 px sur 1440 de haut)', () => {
  expect(DEFAULT_BRANDING.nameSize / BRANDING_REFERENCE_HEIGHT).toBeCloseTo(36 / 1440, 6);
  expect(DEFAULT_BRANDING.lineSize / BRANDING_REFERENCE_HEIGHT).toBeCloseTo(18 / 1440, 6);
});

test('4. une hauteur absente ou aberrante laisse l’échelle à 1', () => {
  // Un canvas pas encore mesuré ne doit pas faire disparaître le bloc.
  expect(brandingScale(0)).toBe(1);
  expect(brandingScale(Number.NaN)).toBe(1);
  expect(brandingScale(-500)).toBe(1);
});
