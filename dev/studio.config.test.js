import { expect, test } from 'bun:test';
import { STUDIO_VIEWS } from './studio.config.js';

test('la navigation du Studio possède des ids uniques et des destinations locales', () => {
  expect(new Set(STUDIO_VIEWS.map(({ id }) => id)).size).toBe(STUDIO_VIEWS.length);
  for (const view of STUDIO_VIEWS) {
    expect(view.label.length).toBeGreaterThan(0);
    expect(view.src.startsWith('./')).toBe(true);
  }
});
