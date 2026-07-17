import { expect, test } from 'bun:test';
import { isHexColor, normalizeColorPalette } from './color-palette-format.js';
import rawPalette from '../components/color-palette.json';

test('normalizeColorPalette sépare les couleurs et résout les références des gradients', () => {
  const palette = normalizeColorPalette(rawPalette);

  expect(palette.colors.length).toBe(15);
  expect(palette.colors.find(({ name }) => name === 'Aquamarine')).toEqual({
    name: 'Aquamarine',
    value: '#9bf0e1',
    hex: '#9bf0e1',
    oklch: 'oklch(0.8967 0.0853 181.93)',
  });
  expect(palette.gradients).toEqual([{
    name: 'Gradient2',
    colors: ['#9bf0e1', '#c2ef94', '#f9e82c', '#ff4632', '#191414', '#4100f5', '#a4bfd0'],
  }]);
});

test('normalizeColorPalette ignore les entrées incomplètes et les références inconnues', () => {
  expect(normalizeColorPalette({
    A: { hex: '#112233', oklch: '' },
    Empty: { hex: '', oklch: '' },
    Gradient: { color1: 'A', color2: 'Missing', color3: { hex: '#445566' } },
    TooShort: { color1: 'A' },
  })).toEqual({
    colors: [{ name: 'A', value: '#112233', hex: '#112233', oklch: null }],
    gradients: [{ name: 'Gradient', colors: ['#112233', '#445566'] }],
  });
});

test('isHexColor accepte uniquement la forme compatible avec input[type=color]', () => {
  expect(isHexColor('#C8B97A')).toBe(true);
  expect(isHexColor('#fff')).toBe(false);
  expect(isHexColor('oklch(1 0 0)')).toBe(false);
});
