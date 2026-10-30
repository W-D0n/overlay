import { describe, expect, test } from 'bun:test';
import { buildRenderUrl, parseRenderUrl } from './render-url.js';

const BASE = 'http://localhost:5931/background.html';

describe('lecture du contrat d’URL de la page de rendu', () => {
  test('sans paramètre, valeurs neutres : fond courant, branding actif, rendu automatique', () => {
    expect(parseRenderUrl('')).toEqual({ presetRef: null, branding: 'on', transparent: false, quality: 'auto', role: 'render' });
  });

  test('les URL déjà en circulation se lisent comme avant', () => {
    expect(parseRenderUrl('?preset=discussion-calme&transparent=1'))
      .toEqual({ presetRef: 'discussion-calme', branding: 'on', transparent: true, quality: 'auto', role: 'render' });
    expect(parseRenderUrl('?preset=Discussion%20calme').presetRef).toBe('Discussion calme');
    expect(parseRenderUrl('?scene=discussion-calme&transparent=1'))
      .toEqual({ presetRef: 'discussion-calme', branding: 'on', transparent: true, quality: 'auto', role: 'render' });
    expect(parseRenderUrl('?preset=a&scene=b').presetRef).toBe('a');
    expect(parseRenderUrl('?preset=&scene=b').presetRef).toBe('b');
    expect(parseRenderUrl('?quality=performance').quality).toBe('performance');
    expect(parseRenderUrl('?role=studio').role).toBe('studio');
    expect(parseRenderUrl('?role=render').role).toBe('render');
    expect(parseRenderUrl('?role=n-importe-quoi').role).toBe('render');
    expect(parseRenderUrl('?branding=off').branding).toBe('off');
  });

  test('branding=only force la transparence : la couche se pose sur une cam ou un gameplay', () => {
    expect(parseRenderUrl('?branding=only')).toMatchObject({ branding: 'only', transparent: true });
  });

  test('toute valeur inconnue retombe sur la valeur neutre, sans exception', () => {
    expect(parseRenderUrl('?preset=&transparent=yes&quality=ultra&branding=maybe'))
      .toEqual({ presetRef: null, branding: 'on', transparent: false, quality: 'auto', role: 'render' });
  });
});

describe('construction des URL de rendu', () => {
  test('transparent=1 est toujours présent ; preset et qualité seulement si demandés', () => {
    expect(buildRenderUrl({ base: BASE })).toBe(`${BASE}?transparent=1`);
    expect(buildRenderUrl({ base: BASE, presetRef: 'ondes', quality: 'performance' }))
      .toBe(`${BASE}?preset=ondes&transparent=1&quality=performance`);
  });

  test('le rôle « studio » se construit et se relit ; le rôle par défaut n’ajoute rien à l’URL d’OBS', () => {
    expect(buildRenderUrl({ base: BASE })).not.toContain('role');
    const url = new URL(buildRenderUrl({ base: BASE, role: 'studio' }));
    expect(url.searchParams.get('role')).toBe('studio');
    expect(parseRenderUrl(url.search).role).toBe('studio');
  });

  test('un aller-retour construction → lecture restitue la demande', () => {
    for (const presetRef of [null, 'ondes', 'Un nom avec espaces & accents é']) {
      for (const quality of ['auto', 'performance']) {
        for (const branding of ['on', 'off', 'only']) {
          const url = new URL(buildRenderUrl({ base: BASE, presetRef, quality, branding }));
          expect(parseRenderUrl(url.search)).toEqual({ presetRef, branding, transparent: true, quality, role: 'render' });
        }
      }
    }
  });
});
