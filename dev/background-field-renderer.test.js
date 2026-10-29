import { describe, expect, test } from 'bun:test';
import {
  appendBackgroundColor,
  backgroundColorsFieldValues,
  backgroundFieldValues,
} from './background-field-renderer.js';

describe('rendu des champs de fond', () => {
  test('prépare chaque champ avec la valeur courante ou son défaut', () => {
    const values = backgroundFieldValues('RainBackground', {
      intensity: 0.8,
      color: 'var(--color-gold)',
    });

    expect(values.map(({ field, value }) => [field.key, value])).toEqual([
      ['intensity', 0.8],
      ['speed', 1],
      ['color', 'var(--color-gold)'],
      ['angle', 8],
      ['audioReactive', false],
      ['audioIntensity', 1],
    ]);
  });

  test('un fond absent ne produit aucun champ', () => {
    expect(backgroundFieldValues(null, {})).toEqual([]);
  });

  test('une palette vide et le bouton d’ajout utilisent toujours l’or Atelier', () => {
    expect(backgroundColorsFieldValues([])).toEqual(['var(--color-gold)']);
    expect(appendBackgroundColor(['#123456'])).toEqual(['#123456', 'var(--color-gold)']);
  });
});

import { createBackgroundFieldRenderer } from './background-field-renderer.js';

describe('champ booléen', () => {
  function fakeElement() {
    return {
      children: [],
      style: {},
      append(...nodes) { this.children.push(...nodes); },
      appendChild(node) { this.children.push(node); },
      replaceChildren(...nodes) { this.children = [...nodes]; },
      setAttribute() {},
      addEventListener() {},
      classList: { add() {}, remove() {}, toggle() {} },
      dataset: {},
    };
  }
  const find = (node, predicate) => predicate(node) ? node : node.children.map((child) => find(child, predicate)).find(Boolean);

  function render(value) {
    const changes = [];
    const container = fakeElement();
    const renderer = createBackgroundFieldRenderer({
      container: /** @type {*} */ (container),
      documentRef: /** @type {*} */ ({ createElement: fakeElement }),
      onChange: (key, next) => changes.push([key, next]),
    });
    renderer.render('RainBackground', { audioReactive: value });
    const checkbox = find(container, (node) => node.type === 'checkbox');
    return { checkbox, changes };
  }

  test('« Réagit au son » est une case à cocher, cochée pour true et pour l’ancien libellé « Oui »', () => {
    expect(render(true).checkbox.checked).toBe(true);
    expect(render('Oui').checkbox.checked).toBe(true);
    expect(render(false).checkbox.checked).toBe(false);
  });

  test('cocher la case publie un booléen', () => {
    const { checkbox, changes } = render(false);
    checkbox.checked = true;
    checkbox.onchange();
    expect(changes).toEqual([['audioReactive', true]]);
  });
});
