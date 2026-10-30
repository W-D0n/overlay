import { describe, expect, test } from 'bun:test';
import { pickStep, rulerTicks } from './ruler-ticks.js';

describe('pickStep', () => {
  test('le pas grandit quand on dézoome : une étiquette garde toujours sa place', () => {
    expect(pickStep(1)).toBe(100);
    expect(pickStep(0.5)).toBe(200);
    expect(pickStep(0.25)).toBe(500);
    expect(pickStep(0.1)).toBe(1000);
    expect(pickStep(4)).toBe(20);
    expect(pickStep(8)).toBe(10);
  });

  test('pour chaque échelle, l’écart écran entre deux étiquettes est au moins celui demandé', () => {
    for (const scale of [0.1, 0.17, 0.33, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8]) {
      expect(pickStep(scale) * scale).toBeGreaterThanOrEqual(64);
    }
  });

  test('une échelle extrême rend le plus grand pas plutôt que rien', () => {
    expect(pickStep(0.0001)).toBe(5000);
  });
});

describe('rulerTicks', () => {
  test('à 100 % : principales tous les 100 px, secondaires tous les 20 px', () => {
    const ticks = rulerTicks({ scale: 1, offset: 0, length: 400 });
    expect(ticks.filter((t) => t.major).map((t) => t.value)).toEqual([0, 100, 200, 300, 400]);
    expect(ticks.find((t) => t.value === 20)).toEqual({ value: 20, position: 20, major: false });
  });

  test('la position suit l’origine : la toile décalée à droite décale les graduations', () => {
    const ticks = rulerTicks({ scale: 0.5, offset: 100, length: 600 });
    const zero = ticks.find((t) => t.value === 0);
    expect(zero.position).toBe(100);
    expect(ticks.find((t) => t.value === 200).position).toBe(200);
  });

  test('une origine hors de la règle (toile partiellement visible) : seules les graduations visibles', () => {
    const ticks = rulerTicks({ scale: 1, offset: -250, length: 300 });
    expect(ticks.every((t) => t.position >= -1 && t.position <= 301)).toBe(true);
    expect(ticks.some((t) => t.value === 300 && t.major)).toBe(true);
    expect(ticks.some((t) => t.value === 0)).toBe(false);
  });

  test('pas de graduation secondaire quand le pas n’est pas divisible en cinq pixels entiers (zoom extrême)', () => {
    const ticks = rulerTicks({ scale: 100, offset: 0, length: 300 });
    expect(ticks.every((t) => t.major)).toBe(true);
    expect(ticks.map((t) => t.value)).toEqual([0, 1, 2, 3]);
  });

  test('les graduations secondaires sont toujours espacées d’au moins 12 px à l’écran, à toute échelle', () => {
    for (const scale of [0.1, 0.25, 0.5, 1, 2, 4, 8]) {
      const ticks = rulerTicks({ scale, offset: 0, length: 2000 });
      for (let i = 1; i < ticks.length; i += 1) expect(ticks[i].position - ticks[i - 1].position).toBeGreaterThanOrEqual(12.7);
    }
  });

  test('entrées dégénérées : aucune graduation, aucune boucle infinie', () => {
    expect(rulerTicks({ scale: 0, offset: 0, length: 100 })).toEqual([]);
    expect(rulerTicks({ scale: 1, offset: 0, length: 0 })).toEqual([]);
    expect(rulerTicks({ scale: Number.NaN, offset: 0, length: 100 })).toEqual([]);
  });
});
