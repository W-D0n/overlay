// @ts-check
import { expect, test } from 'bun:test';
import {
  DEFAULT_TRANSITION,
  MAX_TRANSITION_DURATION_MS,
  normalizeTransition,
  transitionStyles,
  validateTransition,
} from './background-transition.js';

test('1. une transition absente donne les valeurs par défaut', () => {
  expect(normalizeTransition(undefined)).toEqual(DEFAULT_TRANSITION);
  expect(normalizeTransition(null)).toEqual(DEFAULT_TRANSITION);
});

test('2. une transition complète est conservée telle quelle', () => {
  expect(normalizeTransition({ type: 'wipe', durationMs: 300, direction: 'up' }))
    .toEqual({ type: 'wipe', durationMs: 300, direction: 'up' });
});

test('3. un type inconnu retombe sur le fondu', () => {
  expect(normalizeTransition({ type: 'morph' }).type).toBe('fade');
});

test('4. une direction inconnue retombe sur la valeur par défaut', () => {
  expect(normalizeTransition({ type: 'wipe', direction: 'diagonale' }).direction).toBe('right');
});

test('5. une durée négative est ramenée à zéro', () => {
  expect(normalizeTransition({ durationMs: -500 }).durationMs).toBe(0);
});

test('6. une durée excessive est ramenée à la borne haute', () => {
  expect(normalizeTransition({ durationMs: 99999 }).durationMs).toBe(MAX_TRANSITION_DURATION_MS);
});

test('7. une durée non numérique retombe sur le défaut', () => {
  expect(normalizeTransition({ durationMs: 'vite' }).durationMs).toBe(DEFAULT_TRANSITION.durationMs);
  expect(normalizeTransition({ durationMs: Number.NaN }).durationMs).toBe(DEFAULT_TRANSITION.durationMs);
});

test('8. normaliser ne mute jamais l’entrée', () => {
  const input = { type: 'wipe', durationMs: -1 };
  const snapshot = { ...input };
  normalizeTransition(input);
  expect(input).toEqual(snapshot);
});

test('9. le fondu anime l’opacité du calque entrant', () => {
  const styles = transitionStyles({ type: 'fade', direction: 'right' });
  expect(styles.from.opacity).toBe('0');
  expect(styles.to.opacity).toBe('1');
});

test('10. le balayage révèle le calque entrant par clip-path, sans toucher l’opacité', () => {
  const styles = transitionStyles({ type: 'wipe', direction: 'right' });
  expect(styles.from.clipPath).toBe('inset(0 0 0 100%)');
  expect(styles.to.clipPath).toBe('inset(0 0 0 0)');
  expect(styles.from.opacity).toBeUndefined();
});

test('11. chaque sens de balayage part du bord opposé à sa progression', () => {
  expect(transitionStyles({ type: 'wipe', direction: 'left' }).from.clipPath).toBe('inset(0 100% 0 0)');
  expect(transitionStyles({ type: 'wipe', direction: 'up' }).from.clipPath).toBe('inset(100% 0 0 0)');
  expect(transitionStyles({ type: 'wipe', direction: 'down' }).from.clipPath).toBe('inset(0 0 100% 0)');
});

test('12. tous les sens convergent vers le même état final', () => {
  for (const direction of ['left', 'right', 'up', 'down']) {
    expect(transitionStyles({ type: 'wipe', direction }).to.clipPath).toBe('inset(0 0 0 0)');
  }
});

test('13. une transition valide est acceptée', () => {
  expect(validateTransition({ type: 'wipe', durationMs: 400, direction: 'left' }))
    .toEqual({ ok: true, errors: [] });
});

test('14. une transition absente est valide — le champ est optionnel', () => {
  expect(validateTransition(undefined)).toEqual({ ok: true, errors: [] });
});

test('15. la validation refuse ce que la normalisation corrigerait', () => {
  expect(validateTransition({ type: 'morph' }).ok).toBe(false);
  expect(validateTransition({ type: 'fade', durationMs: -1 }).ok).toBe(false);
  expect(validateTransition({ type: 'fade', durationMs: 5000 }).ok).toBe(false);
  expect(validateTransition({ type: 'wipe', direction: 'diagonale' }).ok).toBe(false);
  expect(validateTransition('fade').ok).toBe(false);
});

test('16. toutes les erreurs d’une transition sont listées, pas seulement la première', () => {
  const result = validateTransition({ type: 'morph', durationMs: -1, direction: 'diagonale' });
  expect(result.errors.length).toBe(3);
});
