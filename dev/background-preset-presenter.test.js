import { expect, test } from 'bun:test';
import {
  formatBackgroundPresetImportChange,
  formatBackgroundPresetImportSummary,
} from './background-preset-presenter.js';

test('le résumé d’import distingue les créations, mises à jour, noms ajustés et presets ignorés', () => {
  expect(formatBackgroundPresetImportSummary({
    created: 2,
    updated: 1,
    renamed: 1,
    unchanged: 3,
  })).toBe(
    '2 nouveaux · 1 mise à jour · 1 nom ajusté · 3 ignorés',
  );
  expect(formatBackgroundPresetImportSummary({
    created: 0,
    updated: 2,
    renamed: 0,
    unchanged: 1,
  })).toBe(
    '0 nouveau · 2 mises à jour · 0 nom ajusté · 1 ignoré',
  );
});

test('le détail d’un preset traduit les champs techniques et explique un conflit de nom', () => {
  expect(formatBackgroundPresetImportChange({
    id: 'pluie-importee',
    operation: 'updated',
    name: 'Pluie — import',
    requestedName: 'Pluie',
    renamed: true,
    conflict: { id: 'pluie', name: 'Pluie' },
    component: 'RainBackground',
    differences: [
      { field: 'name', before: 'Pluie vive', after: 'Pluie — import' },
      { field: 'tags', before: ['coding'], after: ['calme', 'discussion'] },
      { field: 'option', key: 'speed', before: 1, after: 0.6 },
      { field: 'option', key: 'angle', before: 8 },
    ],
  })).toEqual({
    operationLabel: 'Mise à jour',
    title: 'Pluie — import',
    note: 'Le nom « Pluie » est déjà utilisé par « Pluie » ; le preset sera importé sous « Pluie — import ».',
    details: [
      'Nom : Pluie vive → Pluie — import',
      'Tags : coding → calme, discussion',
      'Vitesse : 1 → 0.6',
      'Angle du vent (degrés) : retiré (avant : 8)',
    ],
  });
});
