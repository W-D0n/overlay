// @ts-check
import { expect, test } from 'bun:test';
import { BRANDING_REFERENCE_HEIGHT, brandingScale } from './BrandingLayer.js';

test('1. le canvas de référence ne change pas l’échelle', () => {
  expect(brandingScale(BRANDING_REFERENCE_HEIGHT)).toBe(1);
});

test('2. un canvas plus petit réduit proportionnellement', () => {
  expect(brandingScale(1080)).toBeCloseTo(0.75, 5);
});

test('3. un canvas plus grand agrandit proportionnellement', () => {
  expect(brandingScale(2160)).toBeCloseTo(1.5, 5);
});

test('4. une hauteur absente ou aberrante laisse l’échelle à 1', () => {
  // Un canvas pas encore mesuré ne doit pas faire disparaître le bloc.
  expect(brandingScale(0)).toBe(1);
  expect(brandingScale(Number.NaN)).toBe(1);
  expect(brandingScale(-500)).toBe(1);
});
