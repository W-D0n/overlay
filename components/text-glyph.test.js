import { beforeAll, describe, expect, test } from 'bun:test';
import { GLYPH_RISE, GLYPH_WINDOW, glyphLook, glyphUnits } from './text-layout.js';
import { createLayerHarness } from './layer-test-harness.js';

// resolveColor lit le style calculé d'un nœud : un document minimal suffit.
beforeAll(() => {
  globalThis.document ??= /** @type {any} */ ({
    createElement: () => ({ style: {}, remove() {} }),
    body: { appendChild() {} },
    documentElement: {},
  });
  globalThis.getComputedStyle = (/** @type {any} */ node) => ({ color: node.style?.cssText?.match(/color:([^;]+)/)?.[1] ?? '', getPropertyValue: () => '' });
});

describe('glyphUnits : les unités qui apparaissent une à une', () => {
  test('lettres : une unité par lettre, sans les espaces, avec ses bornes dans la ligne', () => {
    expect(glyphUnits('a bc', 'chars')).toEqual([{ start: 0, end: 1 }, { start: 2, end: 3 }, { start: 3, end: 4 }]);
  });

  test('un caractère accentué décomposé ou un emoji composé reste une seule unité', () => {
    const decomposed = 'ét';
    expect(glyphUnits(decomposed, 'chars')).toEqual([{ start: 0, end: 2 }, { start: 2, end: 3 }]);
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}';
    expect(glyphUnits(family, 'chars')).toEqual([{ start: 0, end: family.length }]);
  });

  test('mots : une unité par suite de caractères non blancs', () => {
    expect(glyphUnits('  un  deux trois ', 'words')).toEqual([{ start: 2, end: 4 }, { start: 6, end: 10 }, { start: 11, end: 16 }]);
  });

  test('une ligne vide ou faite d\'espaces n\'a aucune unité', () => {
    for (const unit of /** @type {const} */ (['chars', 'words'])) {
      expect(glyphUnits('', unit)).toEqual([]);
      expect(glyphUnits('   ', unit)).toEqual([]);
    }
  });
});

describe('glyphLook : l\'état d\'une unité', () => {
  const count = 5;
  const alphas = (reveal, presence) => Array.from({ length: count }, (_, index) => glyphLook(reveal, presence, index, count).alpha);

  test('rien à 0, tout à 1, pour les deux manières', () => {
    for (const reveal of /** @type {const} */ (['hard', 'soft'])) {
      expect(alphas(reveal, 0)).toEqual([0, 0, 0, 0, 0]);
      expect(alphas(reveal, 1)).toEqual([1, 1, 1, 1, 1]);
    }
  });

  test('machine à écrire : les unités arrivent une à une dans l\'ordre, d\'un coup', () => {
    expect(alphas('hard', 0.2)).toEqual([1, 0, 0, 0, 0]);
    expect(alphas('hard', 0.5)).toEqual([1, 1, 1, 0, 0]);
    expect(alphas('hard', 0.99)).toEqual([1, 1, 1, 1, 1]);
    expect(glyphLook('hard', 0.7, 0, count).rise).toBe(0);
  });

  test('en douceur : chaque unité apparaît un peu après la précédente, en montant', () => {
    const middle = alphas('soft', 0.5);
    for (let index = 1; index < count; index += 1) expect(middle[index]).toBeLessThanOrEqual(middle[index - 1]);
    expect(middle[0]).toBe(1);
    expect(middle[count - 1]).toBe(0);
    expect(middle.some((alpha) => alpha > 0 && alpha < 1)).toBe(true);
    const rising = glyphLook('soft', 0.5, 2, count);
    expect(rising.rise).toBeGreaterThan(0);
    expect(rising.rise).toBeLessThanOrEqual(GLYPH_RISE);
    expect(glyphLook('soft', 1, 2, count).rise).toBe(0);
  });

  test('la présence ne fait que dévoiler : une unité n\'est jamais moins visible quand la présence croît', () => {
    for (const reveal of /** @type {const} */ (['hard', 'soft'])) {
      for (let index = 0; index < count; index += 1) {
        let previous = 0;
        for (let step = 0; step <= 20; step += 1) {
          const alpha = glyphLook(reveal, step / 20, index, count).alpha;
          expect(alpha).toBeGreaterThanOrEqual(previous);
          previous = alpha;
        }
      }
    }
  });

  test('une seule unité apparaît dès le début, la fenêtre d\'apparition est celle déclarée', () => {
    expect(glyphLook('soft', GLYPH_WINDOW, 0, 1).alpha).toBe(1);
    expect(glyphLook('soft', GLYPH_WINDOW / 2, 0, 1).alpha).toBeCloseTo(0.5, 9);
    expect(glyphLook('hard', 0.01, 0, 1).alpha).toBe(1);
  });
});

async function mounted(options) {
  const { TextLayer } = await import('./TextLayer.js');
  const harness = createLayerHarness();
  const instance = TextLayer(options, harness.environment);
  return { harness, instance };
}
const drawn = (calls) => calls.filter(([kind]) => kind === 'fillText').map(([, text, x, y]) => ({ text, x, y }));
const alphaSets = (calls) => calls.filter(([kind, name]) => kind === 'set' && name === 'globalAlpha').map(([, , value]) => value);

describe('TextLayer : le texte qui se dévoile', () => {
  test('machine à écrire : seules les lettres arrivées sont dessinées, chacune à sa place dans la ligne entière', async () => {
    const { harness, instance } = await mounted({ text: ['abc'], align: 'left' });
    const whole = drawn(harness.tick(16));
    expect(whole.map(({ text }) => text)).toEqual(['abc']);
    instance.animate({ unit: 'chars', reveal: 'hard', presence: 0.5 });
    const half = drawn(harness.tick(32));
    expect(half.map(({ text }) => text)).toEqual(['a', 'b']);
    // La mesure factice donne 8 par caractère : « b » est à 8 de « a », comme dans la ligne entière.
    expect(half[1].x - half[0].x).toBe(8);
    expect(half[0].y).toBe(whole[0].y);
  });

  test('l\'alignement est respecté : centré, la ligne entière est centrée et chaque lettre garde sa place', async () => {
    const { harness, instance } = await mounted({ text: ['abcd'], align: 'center' });
    const whole = drawn(harness.tick(16))[0];
    instance.animate({ unit: 'chars', reveal: 'hard', presence: 1 / 4 + 0.01 });
    const first = drawn(harness.tick(32))[0];
    // Centré, la ligne entière commence à x - largeur / 2 : la première lettre y reste, même seule.
    expect(first.x).toBe(whole.x - (4 * 8) / 2);
  });

  test('à droite, la ligne se termine au bord droit', async () => {
    const { harness, instance } = await mounted({ text: ['abcd'], align: 'right' });
    const whole = drawn(harness.tick(16))[0];
    instance.animate({ unit: 'chars', reveal: 'hard', presence: 0.99 });
    const letters = drawn(harness.tick(32));
    expect(letters.at(-1).x + 8).toBe(whole.x);
  });

  test('mot par mot : les mots arrivent entiers, dans l\'ordre', async () => {
    const { harness, instance } = await mounted({ text: ['un deux trois'], align: 'left', wrap: false });
    harness.tick(16);
    instance.animate({ unit: 'words', reveal: 'hard', presence: 0.3 });
    expect(drawn(harness.tick(32)).map(({ text }) => text)).toEqual(['un']);
    instance.animate({ unit: 'words', reveal: 'hard', presence: 0.6 });
    expect(drawn(harness.tick(48)).map(({ text }) => text)).toEqual(['un', 'deux']);
  });

  test('plusieurs lignes : les unités se suivent d\'une ligne à l\'autre', async () => {
    const { harness, instance } = await mounted({ text: ['ab', 'cd'], align: 'left' });
    harness.tick(16);
    instance.animate({ unit: 'chars', reveal: 'hard', presence: 0.6 });
    const letters = drawn(harness.tick(32));
    expect(letters.map(({ text }) => text)).toEqual(['a', 'b', 'c']);
    expect(letters[2].y).toBeGreaterThan(letters[0].y);
  });

  test('en douceur : chaque unité est dessinée avec sa transparence et sa hauteur, le contexte étant restauré', async () => {
    const { harness, instance } = await mounted({ text: ['abc'], align: 'left' });
    const whole = drawn(harness.tick(16))[0];
    instance.animate({ unit: 'chars', reveal: 'soft', presence: 0.5 });
    const calls = harness.tick(32);
    const letters = drawn(calls);
    expect(letters.length).toBeGreaterThan(0);
    expect(alphaSets(calls).length).toBe(letters.length);
    expect(alphaSets(calls).every((alpha) => alpha > 0 && alpha <= 1)).toBe(true);
    expect(calls.filter(([kind]) => kind === 'save').length).toBe(letters.length);
    expect(calls.filter(([kind]) => kind === 'restore').length).toBe(letters.length);
    expect(letters.some(({ y }) => y > whole.y)).toBe(true);
  });

  test('le contour et l\'ombre suivent chaque unité', async () => {
    const { harness, instance } = await mounted({ text: ['ab'], align: 'left', outlineWidth: 4, shadowBlur: 8 });
    harness.tick(16);
    instance.animate({ unit: 'chars', reveal: 'hard', presence: 1 / 2 + 0.01 });
    const names = harness.tick(32).filter(([kind]) => kind === 'strokeText' || kind === 'fillText').map(([kind]) => kind);
    expect(names).toEqual(['strokeText', 'fillText', 'strokeText', 'fillText']);
  });

  test('la présence pleine redessine le texte d\'un seul trait, comme sans animation', async () => {
    const { harness, instance } = await mounted({ text: ['abc'], align: 'left' });
    harness.tick(16);
    instance.animate({ unit: 'chars', reveal: 'hard', presence: 0.4 });
    harness.tick(32);
    instance.animate({ unit: 'chars', reveal: 'hard', presence: 1 });
    expect(drawn(harness.tick(48)).map(({ text }) => text)).toEqual(['abc']);
  });

  test('null rend le texte entier ; le même état ne redessine pas', async () => {
    const { harness, instance } = await mounted({ text: ['abc'], align: 'left' });
    harness.tick(16);
    instance.animate({ unit: 'chars', reveal: 'hard', presence: 0.4 });
    expect(harness.tick(32).length).toBeGreaterThan(0);
    instance.animate({ unit: 'chars', reveal: 'hard', presence: 0.4 });
    expect(harness.tick(48)).toEqual([]);
    instance.animate(null);
    expect(drawn(harness.tick(64)).map(({ text }) => text)).toEqual(['abc']);
    instance.animate(null);
    expect(harness.tick(80)).toEqual([]);
  });

  test('un texte entier qui n\'a jamais été animé ne redessine pas à l\'état « entier »', async () => {
    const { harness, instance } = await mounted({ text: ['abc'] });
    harness.tick(16);
    instance.animate(null);
    instance.animate({ unit: 'chars', reveal: 'soft', presence: 1 });
    expect(harness.tick(32)).toEqual([]);
  });
});
