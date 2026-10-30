import { describe, expect, test } from 'bun:test';
import { createBrandingContent } from '../branding-content.js';
import { BrandingSceneLayer } from './BrandingSceneLayer.js';

/** Couche de branding factice : enregistre ce qu'on lui demande. */
function fakeLayerFactory(log) {
  return (initial) => {
    log.push(['create', initial]);
    return { el: { id: 'el' }, update: (next) => log.push(['update', next]), destroy: () => log.push(['destroy']) };
  };
}

describe('couche branding d’une scène', () => {
  test('part du contenu global courant, puis suit ses changements en direct', () => {
    const content = createBrandingContent({ name: 'D0n' });
    const log = [];
    BrandingSceneLayer({}, { content, createLayer: fakeLayerFactory(log) });
    content.set({ name: 'Mozaïk' });
    expect(log).toEqual([['create', { name: 'D0n' }], ['update', { name: 'Mozaïk' }]]);
  });

  test('plusieurs couches affichent le même contenu', () => {
    const content = createBrandingContent();
    const log = [];
    BrandingSceneLayer({}, { content, createLayer: fakeLayerFactory(log) });
    BrandingSceneLayer({}, { content, createLayer: fakeLayerFactory(log) });
    content.set('x');
    expect(log.filter(([kind]) => kind === 'update')).toHaveLength(2);
  });

  test('détruite, elle se désabonne : le contenu suivant ne la touche plus', () => {
    const content = createBrandingContent();
    const log = [];
    const instance = BrandingSceneLayer({}, { content, createLayer: fakeLayerFactory(log) });
    instance.destroy();
    content.set('après');
    expect(log).toEqual([['create', undefined], ['destroy']]);
  });

  test('respecte le contrat des couches : un élément, update sans effet, pas de micro ni de réaction native', () => {
    const instance = BrandingSceneLayer({}, { content: createBrandingContent(), createLayer: fakeLayerFactory([]) });
    expect(instance.el).toEqual({ id: 'el' });
    expect(() => instance.update?.({})).not.toThrow();
    expect(instance.setAudioLevel).toBeUndefined();
    expect(instance.trigger).toBeUndefined();
  });
});
