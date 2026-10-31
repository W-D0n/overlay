import { describe, expect, test } from 'bun:test';
import {
  createBackgroundPresetBundle,
  backgroundPresetRevision,
  filterBackgroundPresets,
  findImportedActivePreset,
  mergeBackgroundPresetImport,
  parseBackgroundPresetBundle,
  planSceneImport,
} from './background-preset-library.js';

const presets = [
  { id: 'ondes', name: 'Ondes dorées', component: 'water-ripple', options: {}, tags: ['intermission', 'calme'] },
  { id: 'pluie', name: 'Pluie lente', component: 'rain', options: {}, tags: ['coding'] },
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
    version: 4,
    presets,
    scenes: [],
    assets: [],
  });
  bundle.presets[0].options.changed = true;
  expect(presets[0].options).toEqual({});

  const parsed = parseBackgroundPresetBundle(JSON.stringify(createBackgroundPresetBundle(presets)));
  expect(parsed).toEqual({ ok: true, presets, scenes: [], assets: [] });
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
    component: 'fireflies',
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
      component: 'fireflies',
      requestedName: 'Brume',
      renamed: false,
      conflict: null,
      differences: [
        { field: 'component', after: 'fireflies' },
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
    component: 'rain',
    options: { speed: 1, color: '#ffffff', angle: 8 },
    tags: ['coding', 'calme'],
  }];
  const imported = [{
    id: 'pluie',
    name: 'Pluie vive',
    component: 'bubble',
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
        { field: 'component', before: 'rain', after: 'bubble' },
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
    component: 'rain',
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
    component: 'water-ripple',
    options: {},
  }];
  const imported = [{
    id: 'nouveau',
    name: 'Ondes',
    component: 'bubble',
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
        { field: 'component', after: 'bubble' },
      ],
    }],
  });
});

test('la fusion met à jour les ids connus et renomme une collision de nom sans écraser un autre preset', () => {
  const existing = [
    { id: 'pluie', name: 'Pluie lente', component: 'rain', options: { speed: 1 } },
    { id: 'ondes', name: 'Ondes', component: 'water-ripple', options: {} },
  ];
  const imported = [
    { id: 'pluie', name: 'Pluie mise à jour', component: 'rain', options: { speed: 2 } },
    { id: 'nouveau', name: 'Ondes', component: 'bubble', options: {} },
  ];

  expect(mergeBackgroundPresetImport(existing, imported)).toMatchObject({
    presets: [
      { id: 'pluie', name: 'Pluie mise à jour', component: 'rain', options: { speed: 2 } },
      { id: 'ondes', name: 'Ondes', component: 'water-ripple', options: {} },
      { id: 'nouveau', name: 'Ondes — import', component: 'bubble', options: {} },
    ],
    created: 1,
    updated: 1,
    renamed: 1,
  });
  expect(existing[0].options).toEqual({ speed: 1 });
});

test('le preset actif est resynchronisé seulement si son id faisait partie de l’import', () => {
  const merged = [
    { id: 'pluie', name: 'Pluie importée', component: 'rain', options: { speed: 2 } },
    { id: 'ondes', name: 'Ondes', component: 'water-ripple', options: {} },
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

const presetWithPlayback = {
  id: 'ambiance-test',
  name: 'Ambiance test',
  component: 'rain',
  options: { intensity: 0.5 },
  tags: ['calme'],
  transition: { type: 'wipe', durationMs: 900, direction: 'left', easing: 'easeOut' },
  showBranding: false,
};

test('export, réimport et fusion conservent la transition et showBranding du preset', () => {
  const bundle = createBackgroundPresetBundle([presetWithPlayback]);
  expect(bundle.presets[0]).toEqual(presetWithPlayback);

  const parsed = parseBackgroundPresetBundle(JSON.stringify(bundle));
  expect(parsed.ok).toBe(true);
  expect(parsed.presets[0]).toEqual(presetWithPlayback);

  expect(mergeBackgroundPresetImport([presetWithPlayback], []).presets[0]).toEqual(presetWithPlayback);
  expect(mergeBackgroundPresetImport([], [presetWithPlayback]).presets[0]).toEqual(presetWithPlayback);
});

test('un import qui ne change que la transition ou showBranding est une mise à jour, pas un doublon ignoré', () => {
  const imported = { ...presetWithPlayback, transition: { ...presetWithPlayback.transition, durationMs: 400 }, showBranding: true };
  const plan = mergeBackgroundPresetImport([presetWithPlayback], [imported]);
  expect(plan.updated).toBe(1);
  expect(plan.unchanged).toBe(0);
  expect(plan.presets[0]).toEqual(imported);
  expect(plan.changes[0].differences.map(({ field }) => field).sort()).toEqual(['showBranding', 'transition']);
});

test('un export est en version 4 ; un lot version 1 s’importe en convertissant « Oui » en booléen', () => {
  const exported = createBackgroundPresetBundle([{ id: 'a', name: 'A', component: 'rain', options: { audioReactive: true } }]);
  expect(exported.version).toBe(4);

  const legacyBundle = JSON.stringify({
    format: 'overlay-background-presets',
    version: 1,
    presets: [{ id: 'a', name: 'A', component: 'rain', options: { audioReactive: 'Oui', speed: 2 } }],
  });
  const parsed = parseBackgroundPresetBundle(legacyBundle);
  expect(parsed.ok).toBe(true);
  expect(parsed.presets[0].options).toEqual({ audioReactive: true, speed: 2 });
});

test('une version de lot inconnue est refusée', () => {
  const result = parseBackgroundPresetBundle(JSON.stringify({ format: 'overlay-background-presets', version: 9, presets: [] }));
  expect(result.ok).toBe(false);
});

test('un lot version 1 qui porte d’anciens noms d’effet s’importe sous leurs identifiants neutres', () => {
  const parsed = parseBackgroundPresetBundle(JSON.stringify({
    format: 'overlay-background-presets',
    version: 1,
    presets: [{ id: 'a', name: 'A', component: 'StarsParallaxBackground', options: {} }],
  }));
  expect(parsed.ok).toBe(true);
  expect(parsed.presets[0].component).toBe('stars-parallax');
});

describe('scènes à plusieurs couches (version 3)', () => {
  const layer = (id, kind) => ({ id, kind, visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: {} });
  const scene = (id, name, layers = [layer('rain', 'rain'), layer('bubble', 'bubble')]) => ({ version: 1, id, name, layers });

  test('un export porte les scènes à plusieurs couches en entier et se relit à l’identique', () => {
    const multi = scene('nuit', 'Nuit');
    const bundle = createBackgroundPresetBundle(presets, [multi]);
    expect(bundle.scenes).toEqual([multi]);
    const parsed = parseBackgroundPresetBundle(JSON.stringify(bundle));
    expect(parsed.ok).toBe(true);
    expect(parsed.scenes).toHaveLength(1);
    expect(parsed.scenes[0].layers.map((l) => l.id)).toEqual(['rain', 'bubble']);
    bundle.scenes[0].name = 'changé';
    expect(multi.name).toBe('Nuit');
  });

  test('une scène invalide refuse tout le lot, avec son emplacement', () => {
    const bad = scene('x', 'X', [{ ...layer('rain', 'rain'), placement: 'non' }]);
    const parsed = parseBackgroundPresetBundle({ format: 'overlay-background-presets', version: 3, presets: [], scenes: [bad] });
    expect(parsed.ok).toBe(false);
    expect(parsed.errors[0]).toContain('scenes[0]');
    expect(parseBackgroundPresetBundle({ format: 'overlay-background-presets', version: 3, presets: [], scenes: 'non' }).ok).toBe(false);
  });

  test('un lot sans « scenes » (versions 1 et 2) se lit avec une liste vide', () => {
    const parsed = parseBackgroundPresetBundle({ format: 'overlay-background-presets', version: 2, presets: [] });
    expect(parsed).toEqual({ ok: true, presets: [], scenes: [], assets: [] });
  });

  test('planSceneImport : nouvelle scène créée, identique ignorée, jamais d’écrasement', () => {
    const existing = [scene('nuit', 'Nuit')];
    const plan = planSceneImport(existing, [scene('nuit', 'Nuit'), scene('jour', 'Jour')]);
    expect(plan.unchanged).toBe(1);
    expect(plan.created).toBe(1);
    expect(plan.scenes.map((s) => s.id)).toEqual(['jour']);
    expect(plan.changes.map((c) => c.operation)).toEqual(['unchanged', 'created']);
  });

  test('un identifiant pris par une scène différente reçoit un identifiant libre, un nom pris un nom ajusté', () => {
    const existing = [scene('nuit', 'Nuit')];
    const different = scene('nuit', 'Nuit', [layer('rain', 'rain')]);
    const plan = planSceneImport(existing, [different]);
    expect(plan.created).toBe(1);
    expect(plan.scenes[0].id).toBe('nuit-2');
    expect(plan.scenes[0].name).toContain('import');
    expect(plan.renamed).toBe(1);
    expect(plan.changes[0].conflict).toEqual({ id: 'nuit', name: 'Nuit' });
    expect(existing[0].layers).toHaveLength(2);
  });

  test('deux scènes importées du même nom ne se marchent pas dessus', () => {
    const plan = planSceneImport([], [scene('a', 'Pareil'), scene('b', 'Pareil')]);
    expect(new Set(plan.scenes.map((s) => s.name)).size).toBe(2);
    expect(new Set(plan.scenes.map((s) => s.id)).size).toBe(2);
  });
});
