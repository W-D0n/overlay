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

test('10. le balayage masque par dégradé, jamais par découpe nette', () => {
  const styles = transitionStyles({ type: 'wipe', direction: 'right' });
  expect(styles.incoming.to.clipPath).toBeUndefined();
  expect(styles.incoming.from.maskImage).toContain('linear-gradient(to right');
  expect(styles.incoming.from.maskSize).toBe('200% 100%');
});

test('11. le masque du sortant est l’inverse exact de celui de l’entrant', () => {
  // Même sens, même position : c'est l'inversion du dégradé qui rend les deux complémentaires.
  // Un dégradé miroir laissait les deux calques masqués du même côté (vérifié à l'écran).
  for (const direction of ['left', 'right', 'up', 'down']) {
    const { incoming, outgoing } = transitionStyles({ type: 'wipe', direction });
    expect(outgoing.from.maskPosition).toBe(incoming.from.maskPosition);
    expect(outgoing.to.maskPosition).toBe(incoming.to.maskPosition);
    expect(outgoing.to.maskImage).not.toBe(incoming.to.maskImage);
    expect(outgoing.to.maskImage.startsWith('linear-gradient(transparent')
      || outgoing.to.maskImage.includes('transparent 0%')).toBe(true);
    expect(incoming.to.maskImage.includes('#000 0%')).toBe(true);
  }
});

test('12. chaque propriété de masque est aussi déclinée en -webkit-, pour le CEF d’OBS', () => {
  const { incoming } = transitionStyles({ type: 'wipe', direction: 'right' });
  expect(incoming.to.WebkitMaskImage).toBe(incoming.to.maskImage);
  expect(incoming.to.WebkitMaskPosition).toBe(incoming.to.maskPosition);
});

test('13. les sens horizontaux et verticaux utilisent l’axe et la taille correspondants', () => {
  expect(transitionStyles({ type: 'wipe', direction: 'up' }).incoming.to.maskImage).toContain('to top');
  expect(transitionStyles({ type: 'wipe', direction: 'up' }).incoming.to.maskSize).toBe('100% 200%');
  expect(transitionStyles({ type: 'wipe', direction: 'down' }).incoming.to.maskImage).toContain('to bottom');
});

test('14. l’entrant part masqué et finit visible, jamais l’inverse', () => {
  for (const direction of ['left', 'right', 'up', 'down']) {
    const { incoming } = transitionStyles({ type: 'wipe', direction });
    expect(incoming.from.maskPosition).not.toBe(incoming.to.maskPosition);
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

test('22. chaque propriété animée est déclarée séparément, sans durée implicite', () => {
  const { incoming } = transitionStyles({ type: 'wipe', direction: 'right' });
  expect(incoming.properties).toEqual(['mask-position', '-webkit-mask-position']);
  expect(transitionStyles({ type: 'fade', direction: 'right' }).incoming.properties).toEqual(['opacity']);
});
