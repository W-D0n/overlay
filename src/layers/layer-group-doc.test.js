import { describe, expect, test } from 'bun:test';
import { GroupLayer } from '../components/GroupLayer.js';
import { COMPONENT_REGISTRY } from './component-registry.js';
import { isGroupKind, kindCapabilities, kindFamily, resolveKindId, validateOptions } from './layer-kinds.js';
import { MAX_LAYERS, canonicalSceneDoc, createLayer, currentFromScene, sceneForBrandingMode, validateSceneDoc } from '../scene/scene-doc.js';

const at = (x, y, width, height) => ({ x, y, width, height });
const scene = (...layers) => ({ version: 1, id: 's', name: 'S', layers });
const text = (id, extra = {}) => createLayer({ id, kind: 'text', options: {}, ...extra });
const group = (id, extra = {}) => createLayer({ id, kind: 'group', options: {}, ...extra });

describe('the group kind', () => {
  test('it is a known kind of its own family, with nothing to set', () => {
    expect(resolveKindId('group')).toBe('group');
    expect(isGroupKind('group')).toBe(true);
    expect(isGroupKind('text')).toBe(false);
    expect(isGroupKind('unknown')).toBe(false);
    expect(kindFamily('group')).toBe('group');
    expect(validateOptions('group', {})).toEqual([]);
    expect(kindCapabilities('group')).toEqual({ audio: false, reactions: 'overlay' });
  });

  test('the registry builds its container: an empty full-frame element, no options', () => {
    expect(COMPONENT_REGISTRY.group).toBe(GroupLayer);
    const created = [];
    const documentRef = { createElement: (tag) => { const el = { tag, style: { cssText: '' } }; created.push(el); return el; } };
    const made = GroupLayer(undefined, { documentRef });
    expect(made.el).toBe(created[0]);
    expect(created[0].tag).toBe('div');
    expect(created[0].style.cssText).toContain('position:absolute');
    expect(created[0].style.cssText).toContain('inset:0');
    expect(created[0].style.cssText).toContain('pointer-events:none');
    expect(made.update).toBeUndefined();
  });
});

describe('a scene with groups', () => {
  const grouped = () => scene(text('a', { group: 'g', placement: at(0.1, 0.1, 0.2, 0.2) }), text('b', { group: 'g', placement: at(0.5, 0.5, 0.2, 0.2) }), group('g'), text('c'));

  test('it is valid', () => {
    expect(validateSceneDoc(canonicalSceneDoc(grouped())).ok).toBe(true);
  });

  test('a structural defect refuses the scene, with its path', () => {
    const missing = validateSceneDoc(scene(text('a', { group: 'ghost' })));
    expect(missing.ok).toBe(false);
    expect(missing.errors).toContain('layers[a].group : groupe « ghost » introuvable');
    const empty = validateSceneDoc(scene(text('a'), group('g')));
    expect(empty.errors).toContain('layers[g] : un groupe contient au moins une couche');
    const wrongType = validateSceneDoc(scene(text('a', { group: 7 }), group('g')));
    expect(wrongType.errors).toContain('layers[a].group : identifiant de groupe attendu');
  });

  test('the load guard counts what draws: groups do not count toward the layer limit', () => {
    const members = Array.from({ length: MAX_LAYERS }, (_, index) => text(`m${index}`, { group: 'g' }));
    expect(validateSceneDoc(canonicalSceneDoc(scene(...members, group('g')))).ok).toBe(true);
    const tooMany = Array.from({ length: MAX_LAYERS + 1 }, (_, index) => text(`m${index}`, { group: 'g' }));
    const refused = validateSceneDoc(scene(...tooMany, group('g')));
    expect(refused.ok).toBe(false);
    expect(refused.errors).toContain(`layers : ${MAX_LAYERS} couches au plus`);
  });

  test('the canonical form derives the group placement from its members, whatever was written', () => {
    const canonical = canonicalSceneDoc(grouped());
    expect(canonical.layers.find(({ id }) => id === 'g').placement).toEqual(at(0.1, 0.1, 0.6, 0.6));
    const typed = canonicalSceneDoc(scene(text('a', { group: 'g', placement: at(0.1, 0.1, 0.2, 0.2) }), group('g', { placement: at(0.9, 0.9, 0.05, 0.05) })));
    expect(typed.layers[1].placement).toEqual(at(0.1, 0.1, 0.2, 0.2));
  });

  test('the canonical form is stable: doing it again changes nothing', () => {
    const once = canonicalSceneDoc(grouped());
    expect(canonicalSceneDoc(once)).toEqual(once);
  });

  test('a scene with a group has no legacy preset form, even a single group', () => {
    expect(currentFromScene(canonicalSceneDoc(scene(text('a', { group: 'g' }), group('g'))))).toBeNull();
    expect(currentFromScene(scene(text('a')))).not.toBeNull();
  });

  test('the branding modes keep groups with their members on the effects side', () => {
    const branding = createLayer({ id: 'brand', kind: 'branding', options: {} });
    const withBranding = scene(text('a', { group: 'g' }), group('g'), branding);
    expect(sceneForBrandingMode(withBranding, 'off').layers.map(({ id }) => id)).toEqual(['a', 'g']);
    expect(sceneForBrandingMode(withBranding, 'only').layers.map(({ id }) => id)).toEqual(['brand']);
  });
});
