import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const read = (/** @type {string} */ path) => readFileSync(join(ROOT, path), 'utf8');

/** `directory` (relative to the root) and every folder below it. @param {string} directory @returns {string[]} */
function directoriesUnder(directory) {
  return [directory, ...readdirSync(join(ROOT, directory), { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => directoriesUnder(`${directory}/${entry.name}`))];
}

/** The stylesheet without its comments. */
const css = read('studio/studio.css').replace(/\/\*[\s\S]*?\*\//g, '');
const html = read('studio/index.html');

/** The page and every script the page can load (tests excluded): where a class or an id can be written. */
const sources = (() => {
  let text = html;
  for (const directory of ['', ...directoriesUnder('studio'), ...directoriesUnder('src')]) {
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
  { template: 'layer-button layer-${name}', classes: [...sources.matchAll(/actionButton\('([\w-]+)'/g)].map((match) => `layer-${match[1]}`) },
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


/**
 * The style rules in file order, with the at-rule block (@media, @container) each one sits in (`''` at the top level). Animation steps are not rules.
 * @param {string} text
 * @returns {{ selectors: string[], props: string[], context: string, index: number }[]}
 */
function parseRules(text) {
  /** @type {{ selectors: string[], props: string[], context: string, index: number }[]} */
  const rules = [];
  /** @type {string[]} */
  const stack = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] === '{') {
      const prelude = text.slice(start, i).trim();
      if (/^@(media|container|supports)/.test(prelude)) {
        stack.push(prelude);
        start = i + 1;
      } else if (prelude.startsWith('@')) {
        let depth = 1;
        i += 1;
        while (i < text.length && depth > 0) {
          if (text[i] === '{') depth += 1;
          if (text[i] === '}') depth -= 1;
          i += 1;
        }
        start = i;
        continue;
      } else {
        const end = text.indexOf('}', i);
        const props = text.slice(i + 1, end).split(';').map((declaration) => declaration.split(':')[0].trim()).filter((name) => name !== '');
        rules.push({ selectors: prelude.split(',').map((selector) => selector.trim().replace(/\s+/g, ' ')), props, context: stack.join(' > '), index: rules.length });
        i = end;
        start = i + 1;
      }
    } else if (text[i] === '}') {
      stack.pop();
      start = i + 1;
    }
    i += 1;
  }
  return rules;
}

/** What two rules share: the selectors they both carry and the properties they both set. */
const overlap = (/** @type {ReturnType<typeof parseRules>[number]} */ a, /** @type {ReturnType<typeof parseRules>[number]} */ b) => ({
  selectors: a.selectors.filter((selector) => b.selectors.includes(selector)),
  props: a.props.filter((name) => b.props.includes(name)),
});

/** Rules inside a block that a base rule written later (same selector, same property) silently overrides: with equal specificity the last rule wins. @param {ReturnType<typeof parseRules>} rules */
function shadowedByLaterRules(rules) {
  return rules.filter((rule) => rule.context !== '').flatMap((rule) => rules.filter((later) => later.context === '' && later.index > rule.index).flatMap((later) => {
    const shared = overlap(rule, later);
    return shared.selectors.length > 0 && shared.props.length > 0 ? [`${rule.context} { ${shared.selectors.join(', ')} } : ${shared.props.join(', ')} écrasé plus bas`] : [];
  }));
}

/** Rules written twice at the top level for the very same selectors, with a property in common: the second silently wins, and the first is half dead. @param {ReturnType<typeof parseRules>} rules */
function definedTwice(rules) {
  const top = rules.filter((rule) => rule.context === '');
  const key = (/** @type {ReturnType<typeof parseRules>[number]} */ rule) => [...rule.selectors].sort().join(', ');
  return top.flatMap((rule, position) => top.slice(position + 1).flatMap((later) => {
    const shared = rule.props.filter((name) => later.props.includes(name));
    return key(rule) === key(later) && shared.length > 0 ? [`${key(rule)} : ${shared.join(', ')}`] : [];
  }));
}

/**
 * Declarations that can make the visual order differ from the document order, and so from the Tab order.
 * `order` and the reversed flex directions are banned outright. Grid placement is allowed only where the document order was checked against it:
 * the cells of a row that read in document order (a cell that spans the whole row, or the thumbnail that is the first child of its row), and the three zones, whose narrow layouts put the preview above the library (the preview first, the library and the inspector under it).
 */
const PLACEMENT_PROPS = ['grid-row', 'grid-column', 'grid-area', 'grid-template-areas'];
const PLACEMENT_CHECKED = ['.studio-zones', '.rail', '.stage-zone', '.inspector', '.cc-step', '.cc-step-index', '.cc-step-label', '.cc-step-tools', '.cc-step-fields', '.tl-curve-controls select', '.color-control select', '.preset-draft-line', '.obs-scene-row-warning', '.preset-row:not(.preset-row-builtin) .preset-thumb', '.preset-row .preset-thumb', '.preset-row-builtin .preset-thumb'];
/** @param {string} sheet */
function reorders(sheet) {
  const found = (sheet.match(/(row|column)-reverse/g) ?? []).map((direction) => `flex-direction : ${direction}`);
  for (const rule of parseRules(sheet)) {
    for (const prop of rule.props) {
      const unchecked = PLACEMENT_PROPS.includes(prop) && !rule.selectors.every((selector) => PLACEMENT_CHECKED.includes(selector));
      if (prop === 'order' || unchecked) found.push(`${rule.selectors.join(', ')} : ${prop}`);
    }
  }
  return found;
}

describe('studio/studio.css', () => {
  test('la feuille est bien lue : des centaines de classes et des identifiants', () => {
    expect(classesInCss.size).toBeGreaterThan(200);
    expect(idsInCss.size).toBeGreaterThan(20);
    expect(classesInCss.has('studio-bar')).toBe(true);
  });

  test('la page charge sa feuille de style, après les tokens, et ne garde aucun style en ligne dans <style>', () => {
    expect(html).toContain('<link rel="stylesheet" href="../src/styles/tokens.css">');
    expect(html.indexOf('href="./studio.css"')).toBeGreaterThan(html.indexOf('href="../src/styles/tokens.css"'));
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

  test('l’ordre des règles : aucune règle d’un bloc @media ou @container n’est écrasée par une règle de base écrite plus bas', () => {
    expect(shadowedByLaterRules(parseRules(css))).toEqual([]);
  });

  test('aucune règle n’est écrite deux fois pour les mêmes sélecteurs avec une même propriété', () => {
    expect(definedTwice(parseRules(css))).toEqual([]);
  });

  test('l’ordre visuel est celui du document : aucune règle ne réordonne les éléments, donc la tabulation suit ce que l’œil voit', () => {
    expect(reorders(css)).toEqual([]);
    expect(reorders('.a { order: 2; }')).toHaveLength(1);
    expect(reorders('.a { flex-direction: row-reverse; }')).toHaveLength(1);
    expect(reorders('.a { grid-row: 1; }')).toHaveLength(1);
    expect(reorders('.a { border-color: red; }')).toEqual([]);
  });

  test('ces deux gardes voient les défauts qu’elles cherchent', () => {
    const rules = (/** @type {string[]} */ ...lines) => parseRules(lines.join(' '));
    expect(shadowedByLaterRules(rules('.a { color: red; }', '@container (max-width: 1px) { .a { color: blue; } }'))).toEqual([]);
    expect(shadowedByLaterRules(rules('@container (max-width: 1px) { .a, .b { color: blue; } }', '.a { color: red; }'))).toHaveLength(1);
    expect(shadowedByLaterRules(rules('@media (max-width: 1px) { .a { margin: 0; } }', '.a { color: red; }'))).toEqual([]);
    expect(definedTwice(rules('.a { color: red; }', '.b { color: red; }'))).toEqual([]);
    expect(definedTwice(rules('.a { color: red; }', '.a { color: blue; }'))).toHaveLength(1);
    expect(definedTwice(rules('.a { color: red; }', '.a { margin: 0; }'))).toEqual([]);
    expect(rules('@keyframes k { from { opacity: 0; } to { opacity: 1; } }', '.a { color: red; }')).toHaveLength(1);
  });
});
