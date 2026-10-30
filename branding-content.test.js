import { describe, expect, test } from 'bun:test';
import { brandingContent, createBrandingContent } from './branding-content.js';

describe('contenu du branding', () => {
  test('garde le dernier contenu déposé et prévient chaque abonné', () => {
    const content = createBrandingContent({ name: 'avant' });
    const seen = [];
    content.subscribe((next) => seen.push(['a', next]));
    content.subscribe((next) => seen.push(['b', next]));
    content.set({ name: 'après' });
    expect(content.get()).toEqual({ name: 'après' });
    expect(seen).toEqual([['a', { name: 'après' }], ['b', { name: 'après' }]]);
  });

  test('un abonné désabonné ne reçoit plus rien', () => {
    const content = createBrandingContent();
    const seen = [];
    const stop = content.subscribe((next) => seen.push(next));
    stop();
    content.set('x');
    expect(seen).toEqual([]);
  });

  test('chaque magasin est indépendant ; celui de la page est unique', () => {
    expect(createBrandingContent('a').get()).toBe('a');
    expect(createBrandingContent().get()).toBeUndefined();
    expect(brandingContent).toBe(brandingContent);
  });
});
