import { describe, expect, test } from 'bun:test';
import { historyRows, relativeTime } from './history-view.js';

const NOW = Date.parse('2026-10-30T12:00:00.000Z');
const formatDate = (date) => `le ${date.toISOString().slice(0, 10)}`;
const ago = (ms) => new Date(NOW - ms).toISOString();

describe('relativeTime', () => {
  test('les paliers : instant, minutes, heures, puis la date', () => {
    expect(relativeTime(ago(5_000), NOW, formatDate)).toBe('à l’instant');
    expect(relativeTime(ago(12 * 60_000), NOW, formatDate)).toBe('il y a 12 min');
    expect(relativeTime(ago(3 * 3_600_000 + 5), NOW, formatDate)).toBe('il y a 3 h');
    expect(relativeTime(ago(30 * 3_600_000), NOW, formatDate)).toBe('le 2026-10-29');
  });

  test('un instant futur ou illisible s’affiche tel quel, jamais faux', () => {
    expect(relativeTime(new Date(NOW + 60_000).toISOString(), NOW, formatDate)).toBe('le 2026-10-30');
    expect(relativeTime('hier', NOW, formatDate)).toBe('hier');
  });
});

describe('historyRows', () => {
  const labelOf = (component) => component.toUpperCase();

  test('une ligne par entrée : effet, moment, particularités', () => {
    const rows = historyRows([
      { at: ago(60_000), current: { component: 'rain', options: {}, transition: { type: 'fade', durationMs: 500 }, showBranding: false } },
      { at: ago(2 * 3_600_000), current: { component: null, options: {} } },
    ], { labelOf, nowMs: NOW, formatDate });
    expect(rows).toEqual([
      { at: ago(60_000), title: 'RAIN', when: 'remplacé il y a 1 min', detail: 'transition fade · sans branding' },
      { at: ago(2 * 3_600_000), title: 'Aucun fond', when: 'remplacé il y a 2 h', detail: '' },
    ]);
  });
});
