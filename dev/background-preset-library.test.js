import { expect, test } from 'bun:test';
import {
  createBackgroundPresetBundle,
  backgroundPresetRevision,
  filterBackgroundPresets,
  findImportedActivePreset,
  mergeBackgroundPresetImport,
  parseBackgroundPresetBundle,
} from './background-preset-library.js';

const presets = [
  { id: 'ondes', name: 'Ondes dorées', component: 'WaterRippleBackground', options: {}, tags: ['intermission', 'calme'] },
  { id: 'pluie', name: 'Pluie lente', component: 'RainBackground', options: {}, tags: ['coding'] },
];

test('la recherche de presets couvre nom, effet et tags sans dépendre des accents ni de la casse', () => {
  expect(filterBackgroundPresets(presets, 'dorees').map(({ id }) => id)).toEqual(['ondes']);
  expect(filterBackgroundPresets(presets, 'WATERRIPPLE').map(({ id }) => id)).toEqual(['ondes']);
  expect(filterBackgroundPresets(presets, 'coding').map(({ id }) => id)).toEqual(['pluie']);
  expect(filterBackgroundPresets(presets, '')).toEqual(presets);
});

test('un export de presets se relit avec son format versionné sans partager les options en mémoire', () => {
  const bundle = createBackgroundPresetBundle(presets);
  expect(bundle).toEqual({
    format: 'overlay-background-presets',
    version: 1,
    presets,
  });
  bundle.presets[0].options.changed = true;
  expect(presets[0].options).toEqual({});

  const parsed = parseBackgroundPresetBundle(JSON.stringify(createBackgroundPresetBundle(presets)));
  expect(parsed).toEqual({ ok: true, presets });
});

test('un import rejette entièrement un bundle invalide', () => {
  const parsed = parseBackgroundPresetBundle({
    format: 'overlay-background-presets',
    version: 1,
    presets: [{ id: 'cassé', name: 'Cassé', component: 'UnknownBackground', options: {} }],
  });
  expect(parsed.ok).toBe(false);
  expect(parsed.errors.join(' ')).toContain('effet de fond inconnu');
});

test('le plan d’import décrit les valeurs utiles d’une création', () => {
  const imported = [{
    id: 'brume',
    name: 'Brume',
    component: 'FirefliesBackground',
    options: { count: 18 },
    tags: ['calme'],
  }];

  expect(mergeBackgroundPresetImport([], imported)).toMatchObject({
    created: 1,
    updated: 0,
    renamed: 0,
    unchanged: 0,
    changes: [{
      id: 'brume',
      operation: 'created',
      name: 'Brume',
      component: 'FirefliesBackground',
      requestedName: 'Brume',
      renamed: false,
      conflict: null,
      differences: [
        { field: 'component', after: 'FirefliesBackground' },
        { field: 'tags', after: ['calme'] },
        { field: 'option', key: 'count', after: 18 },
      ],
    }],
  });
});

test('le plan d’import limite une mise à jour aux valeurs réellement modifiées', () => {
  const existing = [{
    id: 'pluie',
    name: 'Pluie lente',
    component: 'RainBackground',
    options: { speed: 1, color: '#ffffff', angle: 8 },
    tags: ['coding', 'calme'],
  }];
  const imported = [{
    id: 'pluie',
    name: 'Pluie vive',
    component: 'BubbleBackground',
    options: { speed: 2, color: '#ffffff', count: 12 },
    tags: ['dynamique'],
  }];

  expect(mergeBackgroundPresetImport(existing, imported)).toMatchObject({
    created: 0,
    updated: 1,
    renamed: 0,
    unchanged: 0,
    changes: [{
      id: 'pluie',
      operation: 'updated',
      name: 'Pluie vive',
      requestedName: 'Pluie vive',
      renamed: false,
      conflict: null,
      differences: [
        { field: 'name', before: 'Pluie lente', after: 'Pluie vive' },
        { field: 'component', before: 'RainBackground', after: 'BubbleBackground' },
        { field: 'tags', before: ['coding', 'calme'], after: ['dynamique'] },
        { field: 'option', key: 'speed', before: 1, after: 2 },
        { field: 'option', key: 'angle', before: 8 },
        { field: 'option', key: 'count', after: 12 },
      ],
    }],
  });
});

test('le plan d’import marque un preset identique comme ignoré', () => {
  const existing = [{
    id: 'pluie',
    name: 'Pluie calme',
    component: 'RainBackground',
    options: { speed: 1, color: '#ffffff' },
    tags: ['calme'],
  }];
  const imported = [{
    ...existing[0],
    options: { color: '#ffffff', speed: 1 },
  }];

  expect(mergeBackgroundPresetImport(existing, imported)).toMatchObject({
    created: 0,
    updated: 0,
    renamed: 0,
    unchanged: 1,
    changes: [{
      id: 'pluie',
      operation: 'unchanged',
      name: 'Pluie calme',
      requestedName: 'Pluie calme',
      renamed: false,
      conflict: null,
      differences: [],
    }],
  });
});

test('le plan d’import explique le renommage causé par un conflit de nom', () => {
  const existing = [{
    id: 'ondes',
    name: 'Ondes',
    component: 'WaterRippleBackground',
    options: {},
  }];
  const imported = [{
    id: 'nouveau',
    name: 'Ondes',
    component: 'BubbleBackground',
    options: {},
  }];

  expect(mergeBackgroundPresetImport(existing, imported)).toMatchObject({
    created: 1,
    updated: 0,
    renamed: 1,
    unchanged: 0,
    changes: [{
      id: 'nouveau',
      operation: 'created',
      name: 'Ondes — import',
      requestedName: 'Ondes',
      renamed: true,
      conflict: { id: 'ondes', name: 'Ondes' },
      differences: [
        { field: 'name', before: 'Ondes', after: 'Ondes — import' },
        { field: 'component', after: 'BubbleBackground' },
      ],
    }],
  });
});

test('la fusion met à jour les ids connus et renomme une collision de nom sans écraser un autre preset', () => {
  const existing = [
    { id: 'pluie', name: 'Pluie lente', component: 'RainBackground', options: { speed: 1 } },
    { id: 'ondes', name: 'Ondes', component: 'WaterRippleBackground', options: {} },
  ];
  const imported = [
    { id: 'pluie', name: 'Pluie mise à jour', component: 'RainBackground', options: { speed: 2 } },
    { id: 'nouveau', name: 'Ondes', component: 'BubbleBackground', options: {} },
  ];

  expect(mergeBackgroundPresetImport(existing, imported)).toMatchObject({
    presets: [
      { id: 'pluie', name: 'Pluie mise à jour', component: 'RainBackground', options: { speed: 2 } },
      { id: 'ondes', name: 'Ondes', component: 'WaterRippleBackground', options: {} },
      { id: 'nouveau', name: 'Ondes — import', component: 'BubbleBackground', options: {} },
    ],
    created: 1,
    updated: 1,
    renamed: 1,
  });
  expect(existing[0].options).toEqual({ speed: 1 });
});

test('le preset actif est resynchronisé seulement si son id faisait partie de l’import', () => {
  const merged = [
    { id: 'pluie', name: 'Pluie importée', component: 'RainBackground', options: { speed: 2 } },
    { id: 'ondes', name: 'Ondes', component: 'WaterRippleBackground', options: {} },
  ];

  expect(findImportedActivePreset(merged, [{ id: 'pluie' }], 'pluie')).toEqual(merged[0]);
  expect(findImportedActivePreset(merged, [{ id: 'ondes' }], 'pluie')).toBeNull();
  expect(findImportedActivePreset(merged, [{ id: 'pluie' }], null)).toBeNull();
});

test('la révision de bibliothèque reste stable à contenu égal et change avec un preset', () => {
  const revision = backgroundPresetRevision(presets);
  expect(backgroundPresetRevision(structuredClone(presets))).toBe(revision);
  expect(backgroundPresetRevision([
    { ...presets[0], options: { amplitude: 2 } },
    presets[1],
  ])).not.toBe(revision);
  expect(revision).toMatch(/^[0-9a-f]{8}$/);
});
