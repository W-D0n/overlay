import { describe, expect, test } from 'bun:test';
import { buildRenderUrl, parseRenderUrl } from './render-url.js';

const BASE = 'http://localhost:5931/background.html';

describe('lecture du contrat d’URL de la page de rendu', () => {
  test('sans paramètre, valeurs neutres : fond courant, branding actif, rendu automatique', () => {
    expect(parseRenderUrl('')).toEqual({ presetRef: null, branding: 'on', transparent: false, quality: 'auto' });
  });

  test('les URL déjà en circulation se lisent comme avant', () => {
    expect(parseRenderUrl('?preset=discussion-calme&transparent=1'))
      .toEqual({ presetRef: 'discussion-calme', branding: 'on', transparent: true, quality: 'auto' });
    expect(parseRenderUrl('?preset=Discussion%20calme').presetRef).toBe('Discussion calme');
    expect(parseRenderUrl('?quality=performance').quality).toBe('performance');
    expect(parseRenderUrl('?branding=off').branding).toBe('off');
  });

  test('branding=only force la transparence : la couche se pose sur une cam ou un gameplay', () => {
    expect(parseRenderUrl('?branding=only')).toMatchObject({ branding: 'only', transparent: true });
  });

  test('toute valeur inconnue retombe sur la valeur neutre, sans exception', () => {
    expect(parseRenderUrl('?preset=&transparent=yes&quality=ultra&branding=maybe'))
      .toEqual({ presetRef: null, branding: 'on', transparent: false, quality: 'auto' });
  });
});

describe('construction des URL de rendu', () => {
  test('transparent=1 est toujours présent ; preset et qualité seulement si demandés', () => {
    expect(buildRenderUrl({ base: BASE })).toBe(`${BASE}?transparent=1`);
    expect(buildRenderUrl({ base: BASE, presetRef: 'ondes', quality: 'performance' }))
      .toBe(`${BASE}?preset=ondes&transparent=1&quality=performance`);
  });

  test('un aller-retour construction → lecture restitue la demande', () => {
    for (const presetRef of [null, 'ondes', 'Un nom avec espaces & accents é']) {
      for (const quality of ['auto', 'performance']) {
        for (const branding of ['on', 'off', 'only']) {
          const url = new URL(buildRenderUrl({ base: BASE, presetRef, quality, branding }));
          expect(parseRenderUrl(url.search)).toEqual({ presetRef, branding, transparent: true, quality });
        }
      }
    }
  });
});
