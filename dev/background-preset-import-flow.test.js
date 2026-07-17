import { expect, test } from 'bun:test';
import {
  createBackgroundPresetImportReview,
  reduceBackgroundPresetImportReview,
} from './background-preset-import-flow.js';

const pending = {
  content: '{"presets":[]}',
  parsed: { presets: [] },
  revision: '1234abcd',
  plan: { created: 1, updated: 0, renamed: 0 },
};

test('un import ne produit une commande qu’après confirmation et ne peut plus être annulé en vol', () => {
  const initial = createBackgroundPresetImportReview();
  const selected = reduceBackgroundPresetImportReview(initial, { type: 'selected', pending });
  expect(selected).toEqual({ state: { pending, importing: false }, command: null });

  const cancelled = reduceBackgroundPresetImportReview(selected.state, { type: 'cancelled' });
  expect(cancelled).toEqual({ state: { pending: null, importing: false }, command: null });

  const confirmed = reduceBackgroundPresetImportReview(selected.state, { type: 'confirmed' });
  expect(confirmed).toEqual({
    state: { pending, importing: true },
    command: { type: 'import', pending },
  });
  expect(reduceBackgroundPresetImportReview(confirmed.state, { type: 'cancelled' })).toEqual({
    state: confirmed.state,
    command: null,
  });
});
