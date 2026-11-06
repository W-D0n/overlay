// @ts-check
import { expect, test } from 'bun:test';
import { pointerToPercent } from './branding-drag.js';

const rect = { left: 100, top: 50, width: 1000, height: 500 };

test('1. le coin haut gauche de l’aperçu vaut 0 %, 0 %', () => {
  expect(pointerToPercent({ pointerX: 100, pointerY: 50, rect })).toEqual({ x: 0, y: 0 });
});

test('2. le centre vaut 50 %, 50 %', () => {
  expect(pointerToPercent({ pointerX: 600, pointerY: 300, rect })).toEqual({ x: 50, y: 50 });
});

test('3. le coin bas droite vaut 100 %, 100 %', () => {
  expect(pointerToPercent({ pointerX: 1100, pointerY: 550, rect })).toEqual({ x: 100, y: 100 });
});

test('4. un pointeur sorti de l’aperçu est ramené dans les bornes', () => {
  expect(pointerToPercent({ pointerX: -500, pointerY: 9000, rect })).toEqual({ x: 0, y: 100 });
});

test('5. la position est arrondie au dixième de pourcent', () => {
  const { x } = pointerToPercent({ pointerX: 100 + 333, pointerY: 50, rect });
  expect(x).toBe(33.3);
});

test('6. un aperçu de taille nulle ne produit ni NaN ni exception', () => {
  const result = pointerToPercent({
    pointerX: 10,
    pointerY: 10,
    rect: { left: 0, top: 0, width: 0, height: 0 },
  });
  expect(result).toEqual({ x: 0, y: 0 });
});
