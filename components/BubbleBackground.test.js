import { describe, expect, test } from 'bun:test';
import {
  bubbleBurstY,
  sampleBurstTravel,
  shouldBurstBubble,
} from './BubbleBackground.js';

describe('éclatement aléatoire des bulles', () => {
  test('sampleBurstTravel répartit le trajet entre les deux bornes', () => {
    expect(sampleBurstTravel(0.2, 0.8, () => 0)).toBe(0.2);
    expect(sampleBurstTravel(0.2, 0.8, () => 0.5)).toBeCloseTo(0.5);
    expect(sampleBurstTravel(0.2, 0.8, () => 1)).toBe(0.8);
  });

  test('sampleBurstTravel ordonne et borne les réglages invalides', () => {
    expect(sampleBurstTravel(1.4, -0.2, () => 0)).toBe(0);
    expect(sampleBurstTravel(1.4, -0.2, () => 1)).toBe(1);
  });

  test('une bulle peut éclater au milieu du viewport, avant le bord haut', () => {
    const burstY = bubbleBurstY(1080, 0.5);
    expect(burstY).toBe(540);
    expect(shouldBurstBubble(700, 20, burstY)).toBe(false);
    expect(shouldBurstBubble(539, 20, burstY)).toBe(true);
  });

  test('le bord haut reste un filet de sécurité', () => {
    expect(shouldBurstBubble(-21, 20, 0)).toBe(true);
  });
});
