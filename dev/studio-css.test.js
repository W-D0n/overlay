import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const read = (/** @type {string} */ path) => readFileSync(join(ROOT, path), 'utf8');

/** The stylesheet without its comments. */
const css = read('dev/studio.css').replace(/\/\*[\s\S]*?\*\//g, '');
const html = read('dev/studio.html');

/** The page and every script the page can load (tests excluded): where a class or an id can be written. */
const sources = (() => {
  let text = html;
  for (const directory of ['dev', 'components', '']) {
    for (const name of readdirSync(join(ROOT, directory))) {
      if (name.endsWith('.js') && !name.endsWith('.test.js')) text += `\n${read(join(directory, name))}`;
    }
  }
  return text;
})();

/**
 * Classes the scripts build from a template (`co-guide-${kind}`): the template is in the sources, and each class it can produce is listed. The test checks the template is still there,
 * so a family cannot outlive the code that builds it.
 */
const DYNAMIC_CLASSES = [
  { template: 'layer-button layer-${name}', classes: ['layer-lock'] },
  { template: 'co-guide co-guide-${guide.kind}', classes: ['co-guide-canvas-edge', 'co-guide-margin'] },
  { template: 'change-row change-${change.kind}', classes: ['change-removed'] },
  { template: 'preset-import-operation--${change.operation}', classes: ['preset-import-operation--unchanged'] },
  { template: '`is-${which}`', classes: ['is-end'] },
];

/** The selectors of the style rules (not the at-rules, not the steps of an animation). */
const selectors = [...css.matchAll(/([^{}]+)\{/g)].map((match) => match[1].trim()).filter((text) => !text.startsWith('@') && !/^\d+%$|^from$|^to$/.test(text));
const classesInCss = new Set(selectors.flatMap((selector) => [...selector.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1])));
const idsInCss = new Set(selectors.flatMap((selector) => [...selector.matchAll(/#([A-Za-z_][\w-]*)/g)].map((match) => match[1])));
const dynamic = new Set(DYNAMIC_CLASSES.flatMap(({ classes }) => classes));

describe('dev/studio.css', () => {
  test('la feuille est bien lue : des centaines de classes et des identifiants', () => {
    expect(classesInCss.size).toBeGreaterThan(200);
    expect(idsInCss.size).toBeGreaterThan(20);
    expect(classesInCss.has('studio-bar')).toBe(true);
  });

  test('la page charge sa feuille de style, après les tokens, et ne garde aucun style en ligne dans <style>', () => {
    expect(html).toContain('<link rel="stylesheet" href="../tokens.css">');
    expect(html.indexOf('href="./studio.css"')).toBeGreaterThan(html.indexOf('href="../tokens.css"'));
    expect(html).not.toContain('<style');
  });

  test('chaque famille de classes bâties par un script existe encore dans le script', () => {
    for (const { template } of DYNAMIC_CLASSES) expect(sources.includes(template), template).toBe(true);
  });

  test('aucune règle morte : chaque classe de la feuille est écrite dans la page ou un script, ou bâtie par un gabarit connu', () => {
    const dead = [...classesInCss].filter((name) => !sources.includes(name) && !dynamic.has(name));
    expect(dead).toEqual([]);
  });

  test('aucune règle morte : chaque identifiant de la feuille est dans la page ou un script', () => {
    const dead = [...idsInCss].filter((name) => !sources.includes(name));
    expect(dead).toEqual([]);
  });

  test('la garde voit une classe morte quand il y en a une', () => {
    const fake = 'une-classe-que-personne-n-ecrit';
    expect(sources.includes(fake)).toBe(false);
    expect([fake].filter((name) => !sources.includes(name) && !dynamic.has(name))).toEqual([fake]);
  });
});
