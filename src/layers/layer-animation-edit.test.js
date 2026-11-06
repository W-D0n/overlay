import { describe, expect, test } from 'bun:test';
import { animationErrors, changePhase, setPhase, toggleRestart } from './layer-animation.js';

describe('setPhase : choisir un préréglage', () => {
  test('une phase neuve part de valeurs utilisables ; la sortie part du départ de la scène', () => {
    expect(setPhase(undefined, 'enter', 'fade')).toEqual({ enter: { preset: 'fade', durationMs: 600 } });
    expect(setPhase(undefined, 'loop', 'float')).toEqual({ loop: { preset: 'float', periodMs: 3000 } });
    expect(setPhase(undefined, 'exit', 'zoom')).toEqual({ exit: { preset: 'zoom', durationMs: 600, onLeave: true } });
  });

  test('changer de préréglage garde les réglages déjà faits', () => {
    const before = { enter: { preset: 'fade', durationMs: 900, delayMs: 250 } };
    expect(setPhase(before, 'enter', 'zoom')).toEqual({ enter: { preset: 'zoom', durationMs: 900, delayMs: 250 } });
  });

  test('les autres phases ne bougent pas', () => {
    const before = { enter: { preset: 'fade', durationMs: 600 }, exit: { preset: 'fade', durationMs: 700, afterMs: 5000 } };
    expect(setPhase(before, 'loop', 'pulse')).toEqual({ ...before, loop: { preset: 'pulse', periodMs: 3000 } });
  });

  test('retirer une phase la supprime ; retirer la dernière supprime l\'animation et ses alertes', () => {
    const before = { enter: { preset: 'fade', durationMs: 600 }, loop: { preset: 'float', periodMs: 3000 }, restartOn: ['event:raid'] };
    expect(setPhase(before, 'loop', null)).toEqual({ enter: before.enter, restartOn: ['event:raid'] });
    expect(setPhase({ enter: before.enter, restartOn: ['event:raid'] }, 'enter', null)).toBeUndefined();
    expect(setPhase(undefined, 'enter', null)).toBeUndefined();
  });

  test('le résultat est toujours valide', () => {
    for (const phase of ['enter', 'loop', 'exit']) {
      const preset = phase === 'loop' ? 'sway' : 'bounce';
      expect(animationErrors('a', setPhase(undefined, phase, preset))).toEqual([]);
    }
  });
});

describe('changePhase : régler un champ', () => {
  const full = {
    enter: { preset: 'fade', durationMs: 600 },
    loop: { preset: 'float', periodMs: 3000 },
    exit: { preset: 'fade', durationMs: 600, onLeave: true },
  };

  test('un champ numérique est réglé et borné', () => {
    expect(changePhase(full, 'enter', 'durationMs', 1200).enter.durationMs).toBe(1200);
    expect(changePhase(full, 'enter', 'durationMs', 5).enter.durationMs).toBe(50);
    expect(changePhase(full, 'enter', 'delayMs', 300).enter.delayMs).toBe(300);
    expect(changePhase(full, 'loop', 'amount', 1.5).loop.amount).toBe(1.5);
    expect(changePhase(full, 'loop', 'periodMs', 99999).loop.periodMs).toBe(60000);
  });

  test('un champ facultatif vidé est retiré, un champ obligatoire vidé est ignoré', () => {
    const delayed = changePhase(full, 'enter', 'delayMs', 300);
    expect('delayMs' in changePhase(delayed, 'enter', 'delayMs', null).enter).toBe(false);
    expect(changePhase(full, 'enter', 'durationMs', null)).toBe(full);
    expect(changePhase(full, 'loop', 'periodMs', null)).toBe(full);
  });

  test('la sortie : un instant, le départ de la scène, ou les deux', () => {
    const dated = changePhase(full, 'exit', 'afterMs', 8000);
    expect(dated.exit).toEqual({ preset: 'fade', durationMs: 600, onLeave: true, afterMs: 8000 });
    expect(changePhase(dated, 'exit', 'onLeave', false).exit).toEqual({ preset: 'fade', durationMs: 600, afterMs: 8000 });
    expect(changePhase(dated, 'exit', 'afterMs', null).exit).toEqual(full.exit);
  });

  test('la sortie ne peut pas perdre son dernier déclencheur', () => {
    expect(changePhase(full, 'exit', 'onLeave', false)).toBe(full);
    const dated = { ...full, exit: { preset: 'fade', durationMs: 600, afterMs: 8000 } };
    expect(changePhase(dated, 'exit', 'afterMs', null)).toBe(dated);
  });

  test('une phase absente ou une animation absente ne changent rien', () => {
    expect(changePhase(undefined, 'enter', 'durationMs', 100)).toBeUndefined();
    const only = { enter: full.enter };
    expect(changePhase(only, 'exit', 'durationMs', 100)).toBe(only);
  });

  test('les alertes de relance sont gardées', () => {
    const withRestart = { ...full, restartOn: ['event:raid'] };
    expect(changePhase(withRestart, 'enter', 'durationMs', 900).restartOn).toEqual(['event:raid']);
  });
});

describe('toggleRestart : cocher une alerte', () => {
  const base = { enter: { preset: 'fade', durationMs: 600 } };

  test('cocher ajoute dans l\'ordre des sources, décocher retire, la dernière décochée retire la liste', () => {
    const raid = toggleRestart(base, 'event:raid');
    expect(raid.restartOn).toEqual(['event:raid']);
    const both = toggleRestart(raid, 'event:follow');
    expect(both.restartOn).toEqual(['event:follow', 'event:raid']);
    expect(toggleRestart(both, 'event:follow').restartOn).toEqual(['event:raid']);
    expect('restartOn' in toggleRestart(raid, 'event:raid')).toBe(false);
  });

  test('sans animation il n\'y a rien à relancer', () => {
    expect(toggleRestart(undefined, 'event:raid')).toBeUndefined();
  });
});
