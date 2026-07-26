// @ts-check
import { expect, test } from 'bun:test';
import { createAudioReaction } from './audio-reaction.js';

const NIVEAUX = { level: 0.5, bass: 0.8, mid: 0.2, treble: 0.3 };

test('1. au silence, tout multiplicateur vaut 1 — un preset non sollicité rend comme avant', () => {
  const reaction = createAudioReaction();
  expect(reaction.boost('level', 0.7)).toBe(1);
  expect(reaction.boost('bass', 2)).toBe(1);
});

test('2. le multiplicateur suit la bande demandée et l’intensité', () => {
  const reaction = createAudioReaction({ audioIntensity: 2 });
  reaction.apply(NIVEAUX);
  expect(reaction.boost('level', 1)).toBeCloseTo(2, 5);
  expect(reaction.boost('bass', 0.5)).toBeCloseTo(1.8, 5);
  expect(reaction.boost('treble', 1)).toBeCloseTo(1.6, 5);
});

test('3. des niveaux absents ou aberrants ne déforment rien', () => {
  const reaction = createAudioReaction();
  reaction.apply(undefined);
  expect(reaction.level()).toBe(0);
  reaction.apply({ level: Number.NaN, bass: 5, treble: -3 });
  expect(reaction.level()).toBe(0);
  expect(reaction.bass()).toBe(1);
  expect(reaction.treble()).toBe(0);
});

test('4. un pic n’est consommé qu’une fois', () => {
  const reaction = createAudioReaction();
  reaction.apply({ level: 0.1 });
  reaction.apply({ level: 0.6 });
  expect(reaction.consumePeak()).toBe(true);
  expect(reaction.consumePeak()).toBe(false);
});

test('5. une fois l’attaque consommée, une montée douce ne déclenche plus de pic', () => {
  const reaction = createAudioReaction();
  // Le passage du silence à 0,5 est une attaque réelle : elle compte.
  reaction.apply({ level: 0.5 });
  expect(reaction.consumePeak()).toBe(true);

  reaction.apply({ level: 0.55 });
  reaction.apply({ level: 0.6 });
  expect(reaction.consumePeak()).toBe(false);
});

test('6. l’intensité se relit depuis les options', () => {
  const reaction = createAudioReaction();
  reaction.readOptions({ audioIntensity: 0 });
  reaction.apply(NIVEAUX);
  expect(reaction.boost('level', 1)).toBe(1);
});

test('7. repasser en non réactif efface le dernier niveau reçu', () => {
  const reaction = createAudioReaction();
  reaction.apply(NIVEAUX);
  expect(reaction.level()).toBe(0.5);
  reaction.readOptions({ audioReactive: 'Non' });
  expect(reaction.level()).toBe(0);
  expect(reaction.consumePeak()).toBe(false);
});

test('8. rester réactif ne remet pas les niveaux à zéro', () => {
  const reaction = createAudioReaction();
  reaction.apply(NIVEAUX);
  reaction.readOptions({ audioReactive: 'Oui', audioIntensity: 1 });
  expect(reaction.level()).toBe(0.5);
});
