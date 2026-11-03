import { describe, expect, test } from 'bun:test';
import { canonicalSceneDoc, MAX_LAYERS, validateSceneDoc } from '../scene-doc.js';
import { LIBRARY_PREFIX, LIBRARY_TEMPLATES, libraryByCategory, searchLibrary } from './builtin-layer-templates.js';
import { SETTINGS_LIMITS, validateStudioSettings } from './studio-settings.js';

const asScene = (template) => ({ version: 1, id: 'modele', name: 'modele', layers: structuredClone(template.layers) });

describe('library templates', () => {
  test('there are templates, with unique lib.* identifiers and names', () => {
    expect(LIBRARY_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(LIBRARY_TEMPLATES.map(({ id }) => id)).size).toBe(LIBRARY_TEMPLATES.length);
    expect(new Set(LIBRARY_TEMPLATES.map(({ name }) => name)).size).toBe(LIBRARY_TEMPLATES.length);
    for (const template of LIBRARY_TEMPLATES) expect(template.id.startsWith(LIBRARY_PREFIX)).toBe(true);
  });

  for (const template of LIBRARY_TEMPLATES) {
    describe(template.id, () => {
      test('is a valid scene, on its own', () => {
        const result = validateSceneDoc(asScene(template));
        expect(result.errors ?? []).toEqual([]);
        expect(result.ok).toBe(true);
      });

      test('is already in canonical form: inserting it changes nothing', () => {
        expect(canonicalSceneDoc(asScene(template)).layers).toEqual(asScene(template).layers);
      });

      test('fits the load guard (groups do not count) and has unique layer ids', () => {
        const drawn = template.layers.filter((layer) => layer.kind !== 'group');
        expect(drawn.length).toBeGreaterThan(0);
        expect(drawn.length).toBeLessThanOrEqual(MAX_LAYERS);
        expect(new Set(template.layers.map(({ id }) => id)).size).toBe(template.layers.length);
      });

      test('can be copied into the owner templates: name, size and settings validation', () => {
        expect(template.name.length).toBeLessThanOrEqual(SETTINGS_LIMITS.nameLength);
        expect(JSON.stringify(template.layers).length).toBeLessThanOrEqual(SETTINGS_LIMITS.templateBytes);
        const stored = { id: 'tpl.copie', name: template.name, layers: template.layers };
        expect(validateStudioSettings({ templates: [stored] }).ok).toBe(true);
      });

      test('has a category and a description', () => {
        expect(template.category.trim()).not.toBe('');
        expect(template.description.trim()).not.toBe('');
      });
    });
  }

  test('the alert panels restart on their own alert, and leave after a delay', () => {
    const follow = LIBRARY_TEMPLATES.find(({ id }) => id === 'lib.alerte-follow').layers.find((layer) => layer.kind === 'group');
    expect(follow.animation.restartOn).toEqual(['event:follow']);
    expect(follow.animation.exit.afterMs).toBeGreaterThan(0);
    const raid = LIBRARY_TEMPLATES.find(({ id }) => id === 'lib.alerte-raid').layers.find((layer) => layer.kind === 'group');
    expect(raid.animation.restartOn).toEqual(['event:raid']);
  });
});

describe('libraryByCategory', () => {
  test('keeps every template once, categories in order of first appearance', () => {
    const groups = libraryByCategory();
    expect(groups.flatMap(({ templates }) => templates.map(({ id }) => id)).sort()).toEqual(LIBRARY_TEMPLATES.map(({ id }) => id).sort());
    expect(groups.map(({ category }) => category)).toEqual([...new Set(LIBRARY_TEMPLATES.map(({ category }) => category))]);
  });
});

describe('searchLibrary', () => {
  test('finds by name, category or description, ignoring case and accents', () => {
    expect(searchLibrary('ALERTE').map(({ id }) => id)).toEqual(['lib.alerte-follow', 'lib.alerte-raid']);
    expect(searchLibrary('écrans attente').map(({ id }) => id)).toEqual(['lib.je-reviens']);
    expect(searchLibrary('neon').map(({ id }) => id)).toEqual(['lib.titre-neon']);
  });

  test('every word must match; an empty query keeps everything; nothing matching gives nothing', () => {
    expect(searchLibrary('alerte raid').map(({ id }) => id)).toEqual(['lib.alerte-raid']);
    expect(searchLibrary('  ')).toHaveLength(LIBRARY_TEMPLATES.length);
    expect(searchLibrary('xyzzy')).toEqual([]);
  });
});
