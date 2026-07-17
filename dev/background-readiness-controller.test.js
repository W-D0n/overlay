import { describe, expect, test } from 'bun:test';
import { readinessRevealDelays } from './background-readiness-controller.js';

describe('replay du contrôle avant live', () => {
  test('révèle les étapes dans leur ordre avec un décalage régulier', () => {
    expect(readinessRevealDelays(5, 90, false)).toEqual([0, 90, 180, 270, 360]);
  });

  test('annule le décalage quand la réduction de mouvement est demandée', () => {
    expect(readinessRevealDelays(5, 90, true)).toEqual([0, 0, 0, 0, 0]);
  });

  test('un rapport vide ne planifie aucune animation', () => {
    expect(readinessRevealDelays(0, 90, false)).toEqual([]);
  });
});
