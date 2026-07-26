// @ts-check
import { expect, test } from 'bun:test';
import { resolveWorkspace } from './workspace-tabs.js';

const ESPACES = ['fond', 'habillage', 'diffusion'];

test('1. un espace demandé et déclaré est retenu', () => {
  expect(resolveWorkspace(ESPACES, 'habillage')).toBe('habillage');
});

test('2. aucune demande retombe sur le premier espace', () => {
  expect(resolveWorkspace(ESPACES, null)).toBe('fond');
});

test('3. un espace inconnu retombe sur le premier — un réglage périmé ne vide pas le panneau', () => {
  expect(resolveWorkspace(ESPACES, 'scenes-completes')).toBe('fond');
});

test('4. aucune déclaration ne lève pas', () => {
  expect(resolveWorkspace([], 'fond')).toBe('');
});
