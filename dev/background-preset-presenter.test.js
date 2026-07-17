import { expect, test } from 'bun:test';
import { formatBackgroundPresetImportSummary } from './background-preset-presenter.js';

test('le résumé d’import distingue les créations, mises à jour et noms ajustés', () => {
  expect(formatBackgroundPresetImportSummary({ created: 2, updated: 1, renamed: 1 })).toBe(
    '2 nouveaux · 1 mise à jour · 1 nom ajusté',
  );
  expect(formatBackgroundPresetImportSummary({ created: 0, updated: 2, renamed: 0 })).toBe(
    '0 nouveau · 2 mises à jour · 0 nom ajusté',
  );
});
