// @ts-check
import { expect, test } from 'bun:test';
import {
  cssEasing,
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
  expect(normalizeTransition({ type: 'wipe', durationMs: 300, direction: 'up', easing: 'linear' }))
    .toEqual({ type: 'wipe', durationMs: 300, direction: 'up', easing: 'linear' });
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

test('9. le fondu croise les opacités des deux calques', () => {
  const styles = transitionStyles({ type: 'fade', direction: 'right' });
  expect(styles.incoming.from.opacity).toBe('0');
  expect(styles.incoming.to.opacity).toBe('1');
  expect(styles.outgoing.from.opacity).toBe('1');
  expect(styles.outgoing.to.opacity).toBe('0');
});

test('10. le balayage révèle l’entrant par clip-path, sans toucher l’opacité', () => {
  const styles = transitionStyles({ type: 'wipe', direction: 'right' });
  expect(styles.incoming.from.clipPath).toBe('inset(0 0 0 100%)');
  expect(styles.incoming.to.clipPath).toBe('inset(0 0 0 0)');
  expect(styles.incoming.from.opacity).toBeUndefined();
});

test('11. le balayage masque le sortant symétriquement — sinon il resterait visible', () => {
  // Les canvas sont transparents : révéler l'entrant ne cache pas le sortant.
  expect(transitionStyles({ type: 'wipe', direction: 'right' }).outgoing.to.clipPath).toBe('inset(0 100% 0 0)');
  expect(transitionStyles({ type: 'wipe', direction: 'left' }).outgoing.to.clipPath).toBe('inset(0 0 0 100%)');
  expect(transitionStyles({ type: 'wipe', direction: 'up' }).outgoing.to.clipPath).toBe('inset(0 0 100% 0)');
  expect(transitionStyles({ type: 'wipe', direction: 'down' }).outgoing.to.clipPath).toBe('inset(100% 0 0 0)');
});

test('12. le masque du sortant est exactement le complément de celui de l’entrant', () => {
  for (const direction of ['left', 'right', 'up', 'down']) {
    const styles = transitionStyles({ type: 'wipe', direction });
    const opposite = { left: 'right', right: 'left', up: 'down', down: 'up' }[direction];
    expect(styles.outgoing.to.clipPath).toBe(transitionStyles({ type: 'wipe', direction: opposite }).incoming.from.clipPath);
  }
});

test('13. chaque sens de balayage part du bord opposé à sa progression', () => {
  expect(transitionStyles({ type: 'wipe', direction: 'left' }).incoming.from.clipPath).toBe('inset(0 100% 0 0)');
  expect(transitionStyles({ type: 'wipe', direction: 'up' }).incoming.from.clipPath).toBe('inset(100% 0 0 0)');
  expect(transitionStyles({ type: 'wipe', direction: 'down' }).incoming.from.clipPath).toBe('inset(0 0 100% 0)');
});

test('14. tous les sens convergent vers le même état final', () => {
  for (const direction of ['left', 'right', 'up', 'down']) {
    expect(transitionStyles({ type: 'wipe', direction }).incoming.to.clipPath).toBe('inset(0 0 0 0)');
  }
});

test('15. l’easing par défaut adoucit départ et arrivée', () => {
  expect(normalizeTransition({}).easing).toBe('easeInOut');
  expect(cssEasing('easeInOut')).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
  expect(cssEasing('linear')).toBe('linear');
});

test('16. un easing inconnu retombe sur le défaut, au rendu comme à la normalisation', () => {
  expect(normalizeTransition({ easing: 'rebond' }).easing).toBe('easeInOut');
  expect(cssEasing(/** @type {*} */ ('rebond'))).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
});

test('17. un easing hors liste est refusé à l’écriture', () => {
  expect(validateTransition({ easing: 'rebond' }).ok).toBe(false);
  expect(validateTransition({ easing: 'easeOut' }).ok).toBe(true);
});

test('18. une transition valide est acceptée', () => {
  expect(validateTransition({ type: 'wipe', durationMs: 400, direction: 'left' }))
    .toEqual({ ok: true, errors: [] });
});

test('19. une transition absente est valide — le champ est optionnel', () => {
  expect(validateTransition(undefined)).toEqual({ ok: true, errors: [] });
});

test('20. la validation refuse ce que la normalisation corrigerait', () => {
  expect(validateTransition({ type: 'morph' }).ok).toBe(false);
  expect(validateTransition({ type: 'fade', durationMs: -1 }).ok).toBe(false);
  expect(validateTransition({ type: 'fade', durationMs: 5000 }).ok).toBe(false);
  expect(validateTransition({ type: 'wipe', direction: 'diagonale' }).ok).toBe(false);
  expect(validateTransition('fade').ok).toBe(false);
});

test('21. toutes les erreurs d’une transition sont listées, pas seulement la première', () => {
  const result = validateTransition({ type: 'morph', durationMs: -1, direction: 'diagonale' });
  expect(result.errors.length).toBe(3);
});
