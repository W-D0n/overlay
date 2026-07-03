// @ts-check
/**
 * components/index.test.js — Tests de la logique pure des composants (S8).
 * Bun n'a pas de DOM en environnement de test (`document` indéfini) : seule la logique qui ne
 * touche pas au DOM est testée ici. Le rendu visuel des composants est vérifié manuellement
 * (comme tous les composants existants avant S8).
 */
import { test, expect } from 'bun:test';
import { isExternalAssetPath } from './index.js';

test('isExternalAssetPath rejects http/https URLs', () => {
  expect(isExternalAssetPath('http://example.com/logo.png')).toBe(true);
  expect(isExternalAssetPath('https://example.com/logo.png')).toBe(true);
});

test('isExternalAssetPath rejects other URL schemes (data:, ftp:...)', () => {
  expect(isExternalAssetPath('data:image/png;base64,abc')).toBe(true);
  expect(isExternalAssetPath('ftp://example.com/logo.png')).toBe(true);
});

test('isExternalAssetPath accepts local relative paths', () => {
  expect(isExternalAssetPath('assets/logo.png')).toBe(false);
  expect(isExternalAssetPath('./assets/logo.png')).toBe(false);
  expect(isExternalAssetPath('/assets/logo.png')).toBe(false);
});
