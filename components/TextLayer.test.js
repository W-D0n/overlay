import { beforeAll, describe, expect, test } from 'bun:test';
import { createLayerHarness } from './layer-test-harness.js';

// resolveColor lit le style calculé d'un nœud : un document minimal suffit, la couleur « rgb(...) » est rendue telle quelle.
beforeAll(() => {
  globalThis.document ??= /** @type {any} */ ({
    createElement: () => ({ style: {}, remove() {} }),
    body: { appendChild() {} },
    documentElement: {},
  });
  globalThis.getComputedStyle = (/** @type {any} */ node) => ({ color: node.style?.cssText?.match(/color:([^;]+)/)?.[1] ?? '', getPropertyValue: () => '' });
});

async function mounted(options, size) {
  const { TextLayer } = await import('./TextLayer.js');
  const harness = createLayerHarness(size);
  const instance = TextLayer(options, harness.environment);
  return { harness, instance };
}

const sets = (calls, property) => calls.filter(([kind, name]) => kind === 'set' && name === property).map(([, , value]) => value);
const texts = (calls) => calls.filter(([kind]) => kind === 'fillText').map(([, text]) => text);

describe('TextLayer', () => {
  test('dessine chaque ligne du texte, dans la police et la taille réglées', async () => {
    const { harness } = await mounted({ text: ['Titre', 'Sous-titre'], fontSize: 60, font: 'sans', bold: true, italic: true });
    const calls = harness.tick(16);
    expect(texts(calls)).toEqual(['Titre', 'Sous-titre']);
    expect(sets(calls, 'font').at(-1)).toMatch(/^italic 700 60px /);
    expect(sets(calls, 'textAlign').at(-1)).toBe('center');
  });

  test('statique : aucun dessin aux images suivantes', async () => {
    const { harness } = await mounted({ text: ['Titre'] });
    expect(harness.tick(16).length).toBeGreaterThan(0);
    expect(harness.tick(32)).toEqual([]);
    expect(harness.tick(48)).toEqual([]);
  });

  test('une mise à jour des options redessine une fois ; les mêmes options ne redessinent pas', async () => {
    const { harness, instance } = await mounted({ text: ['Titre'] });
    harness.tick(16);
    instance.update({ text: ['Titre'] });
    expect(harness.tick(32)).toEqual([]);
    instance.update({ text: ['Autre'] });
    expect(texts(harness.tick(48))).toEqual(['Autre']);
    expect(harness.tick(64)).toEqual([]);
  });

  test('le contour est tracé avant le remplissage, avec une ombre sous lui', async () => {
    const { harness } = await mounted({ text: ['A'], outlineWidth: 4, shadowBlur: 8 });
    const names = harness.tick(16).filter(([kind]) => kind === 'strokeText' || kind === 'fillText').map(([kind]) => kind);
    expect(names).toEqual(['strokeText', 'fillText']);
  });

  test('majuscules, alignement à gauche et espacement des lettres arrivent au contexte', async () => {
    const { harness } = await mounted({ text: ['abc'], uppercase: true, align: 'left', letterSpacing: 3 });
    const calls = harness.tick(16);
    expect(texts(calls)).toEqual(['ABC']);
    expect(sets(calls, 'textAlign').at(-1)).toBe('left');
    expect(sets(calls, 'letterSpacing')).toContain('3px');
  });

  test('un texte vide ne dessine rien et ne lève pas', async () => {
    const { harness } = await mounted({ text: [] });
    expect(texts(harness.tick(16))).toEqual([]);
  });
});
