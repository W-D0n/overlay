// @ts-check
import { expect, test } from 'bun:test';
import { computeLevels, isAudioPeak, SILENT_LEVELS } from './audio-levels.js';

const SAMPLE_RATE = 48000;
const BIN_COUNT = 1024; // fftSize 2048

/**
 * Spectre synthétique : énergie pleine sur une seule fréquence, silence ailleurs.
 * @param {number} hz
 */
function spectrumAt(hz) {
  const spectrum = new Uint8Array(BIN_COUNT);
  const hzPerBin = SAMPLE_RATE / (BIN_COUNT * 2);
  spectrum[Math.round(hz / hzPerBin)] = 255;
  return spectrum;
}

/** Applique `computeLevels` en boucle jusqu'à stabilisation du lissage. */
function settle(spectrum, iterations = 60) {
  let levels = SILENT_LEVELS;
  for (let i = 0; i < iterations; i += 1) {
    levels = computeLevels({ spectrum, sampleRate: SAMPLE_RATE, previous: levels });
  }
  return levels;
}

test('1. un spectre à 100 Hz charge le grave et laisse medium et aigu quasi nuls', () => {
  const levels = settle(spectrumAt(100));
  expect(levels.bass).toBeGreaterThan(levels.mid);
  expect(levels.bass).toBeGreaterThan(levels.treble);
  expect(levels.mid).toBeLessThan(0.01);
  expect(levels.treble).toBeLessThan(0.01);
});

test('1b. le niveau général suit la bande la plus chargée, pas la moyenne du spectre', () => {
  // Une source étroite (voix, basse) ne doit pas être diluée : sinon les effets pilotés par
  // `level` ne réagissent qu'à quelques pourcents.
  const levels = settle(spectrumAt(100));
  expect(levels.level).toBe(levels.bass);
  expect(levels.level).toBeGreaterThan(0.9);
});

test('2. un spectre à 5000 Hz charge l’aigu et laisse le grave quasi nul', () => {
  const levels = settle(spectrumAt(5000));
  expect(levels.treble).toBeGreaterThan(levels.bass);
  expect(levels.bass).toBeLessThan(0.01);
});

test('3. un spectre vide donne quatre valeurs à zéro', () => {
  const levels = computeLevels({
    spectrum: new Uint8Array(BIN_COUNT),
    sampleRate: SAMPLE_RATE,
    previous: SILENT_LEVELS,
  });
  expect(levels).toEqual(SILENT_LEVELS);
});

test('4. toutes les valeurs restent dans [0, 1] même à saturation', () => {
  const saturated = new Uint8Array(BIN_COUNT).fill(255);
  const levels = settle(saturated);
  for (const value of Object.values(levels)) {
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  }
});

test('5. une montée brutale est suivie en une à deux frames', () => {
  const loud = new Uint8Array(BIN_COUNT).fill(255);
  const first = computeLevels({ spectrum: loud, sampleRate: SAMPLE_RATE, previous: SILENT_LEVELS });
  const second = computeLevels({ spectrum: loud, sampleRate: SAMPLE_RATE, previous: first });
  expect(first.level).toBeGreaterThan(0.4);
  expect(second.level).toBeGreaterThan(0.7);
});

test('6. une chute brutale décroît progressivement au lieu de tomber à zéro', () => {
  const previous = settle(new Uint8Array(BIN_COUNT).fill(255));
  const silence = new Uint8Array(BIN_COUNT);
  const next = computeLevels({ spectrum: silence, sampleRate: SAMPLE_RATE, previous });
  expect(next.level).toBeLessThan(previous.level);
  expect(next.level).toBeGreaterThan(previous.level * 0.5);
});

test('7. le silence prolongé finit par ramener les niveaux à zéro', () => {
  let levels = settle(new Uint8Array(BIN_COUNT).fill(255));
  const silence = new Uint8Array(BIN_COUNT);
  for (let i = 0; i < 400; i += 1) {
    levels = computeLevels({ spectrum: silence, sampleRate: SAMPLE_RATE, previous: levels });
  }
  expect(levels.level).toBeLessThan(0.01);
});

test('8. l’entrée précédente n’est jamais mutée', () => {
  const previous = { level: 0.5, bass: 0.5, mid: 0.5, treble: 0.5 };
  const snapshot = { ...previous };
  computeLevels({ spectrum: spectrumAt(100), sampleRate: SAMPLE_RATE, previous });
  expect(previous).toEqual(snapshot);
});

test('9. un spectre vide de bins ne produit ni NaN ni exception', () => {
  const levels = computeLevels({
    spectrum: new Uint8Array(0),
    sampleRate: SAMPLE_RATE,
    previous: SILENT_LEVELS,
  });
  for (const value of Object.values(levels)) expect(Number.isFinite(value)).toBe(true);
});

test('10. une montée franche au-dessus du plancher est un pic', () => {
  expect(isAudioPeak(0.3, 0.5)).toBe(true);
});

test('11. une montée franche sous le plancher n’est pas un pic', () => {
  expect(isAudioPeak(0.05, 0.25)).toBe(false);
});

test('12. un niveau élevé mais stable n’est pas un pic', () => {
  expect(isAudioPeak(0.8, 0.82)).toBe(false);
});

test('13. une descente n’est jamais un pic', () => {
  expect(isAudioPeak(0.9, 0.4)).toBe(false);
});

test('14. une valeur non finie ne produit jamais de pic', () => {
  expect(isAudioPeak(Number.NaN, 0.9)).toBe(false);
  expect(isAudioPeak(0.1, Number.POSITIVE_INFINITY)).toBe(false);
});
