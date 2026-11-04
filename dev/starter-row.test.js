import { describe, expect, test } from 'bun:test';
import { CODE_TEMPLATES } from '../components/code-templates.js';
import { BACKGROUND_FIELD_SCHEMAS } from './component-field-schemas.js';
import { buildStarterRow, isUntouchedCode } from './starter-row.js';

const defaults = Object.fromEntries(BACKGROUND_FIELD_SCHEMAS.code.map(({ key, default: value }) => [key, value]));
const [first, second] = CODE_TEMPLATES;

describe('isUntouchedCode', () => {
  test('le code par défaut, ou celui d’un modèle, n’a pas été touché', () => {
    expect(isUntouchedCode({})).toBe(true);
    expect(isUntouchedCode(defaults)).toBe(true);
    expect(isUntouchedCode({ html: first.html, css: first.css, js: first.js })).toBe(true);
    expect(isUntouchedCode({ html: second.html, css: second.css, js: second.js })).toBe(true);
  });

  test('un code écrit à la main est touché, quelle que soit la partie modifiée', () => {
    for (const key of ['html', 'css', 'js']) expect(isUntouchedCode({ ...defaults, [key]: `${defaults[key]} // à moi` })).toBe(false);
  });

  test('mélanger les parties de deux modèles est du code écrit', () => {
    expect(isUntouchedCode({ html: first.html, css: second.css, js: first.js })).toBe(false);
  });
});

/** A hand-made element; `change` and `click` handlers are kept to be fired. */
function element(tag) {
  const handlers = {};
  return {
    tag, handlers, children: [], className: '', attrs: {}, textContent: '', value: '', disabled: false,
    setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener(name, handler) { handlers[name] = handler; },
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); return node; },
  };
}

function setup({ options = {}, currentOptions } = {}) {
  const documentRef = { createElement: (tag) => element(tag) };
  const container = element('div');
  const applied = [];
  buildStarterRow({ documentRef, container, options, ...(currentOptions === undefined ? {} : { currentOptions }), apply: (patch) => applied.push(patch) });
  const [label, row, help] = container.children;
  const [select, button] = row.children;
  const choose = (id) => { select.value = id; select.handlers.change(); };
  return { container, label, row, help, select, button, applied, choose };
}

describe('ligne « Modèle de départ »', () => {
  test('une étiquette, une liste (un choix vide puis chaque modèle), un bouton désactivé et une aide', () => {
    const { label, row, select, button, help } = setup();
    expect(label.textContent).toBe('Modèle de départ');
    expect(row.className).toBe('starter-row');
    expect(select.attrs['aria-label']).toBe('Modèle de départ');
    expect(select.children.map((option) => option.value)).toEqual(['', ...CODE_TEMPLATES.map(({ id }) => id)]);
    expect(select.children[0].textContent).toBe('Choisir un modèle…');
    expect(select.children[1].textContent).toBe(first.label);
    expect(button.className).toBe('starter-apply');
    expect(button.textContent).toBe('Appliquer');
    expect(button.disabled).toBe(true);
    expect(help.attrs.role).toBe('status');
  });

  test('choisir un modèle active le bouton et affiche sa description ; revenir au choix vide le désactive', () => {
    const { select, button, help, choose } = setup();
    choose(first.id);
    expect(button.disabled).toBe(false);
    expect(help.textContent).toBe(first.description);
    choose('');
    expect(button.disabled).toBe(true);
    expect(help.textContent).toBe('');
    expect(select.value).toBe('');
  });

  test('sur du code non touché, appliquer remplace tout d’un coup, réglages compris', () => {
    const { button, applied, choose } = setup({ options: defaults });
    choose(second.id);
    button.handlers.click();
    expect(applied).toEqual([{ html: second.html, css: second.css, js: second.js, paramSpec: second.paramSpec, params: {} }]);
  });

  test('sur du code écrit, le premier clic demande confirmation, le second applique', () => {
    const { button, help, applied, choose } = setup({ options: { ...defaults, js: '// à moi' } });
    choose(first.id);
    button.handlers.click();
    expect(applied).toEqual([]);
    expect(button.textContent).toBe('Remplacer mon code ?');
    expect(help.textContent).toContain('remplace le HTML, le CSS, le JavaScript');
    button.handlers.click();
    expect(applied).toHaveLength(1);
    expect(applied[0].html).toBe(first.html);
  });

  test('changer de modèle annule la demande de confirmation', () => {
    const { button, applied, choose } = setup({ options: { ...defaults, js: '// à moi' } });
    choose(first.id);
    button.handlers.click();
    choose(second.id);
    expect(button.textContent).toBe('Appliquer');
    button.handlers.click();
    expect(applied).toEqual([]);
    expect(button.textContent).toBe('Remplacer mon code ?');
  });

  test('les options relues au clic l’emportent sur celles de la construction du formulaire', () => {
    let live = defaults;
    const { button, applied, choose } = setup({ options: { ...defaults, js: '// ancien' }, currentOptions: () => live });
    choose(first.id);
    button.handlers.click();
    expect(applied).toHaveLength(1);
    applied.length = 0;
    live = { ...defaults, js: '// écrit depuis' };
    button.handlers.click();
    expect(applied).toEqual([]);
    expect(button.textContent).toBe('Remplacer mon code ?');
  });

  test('un clic sans modèle choisi ne fait rien', () => {
    const { button, applied } = setup({ options: defaults });
    button.handlers.click();
    expect(applied).toEqual([]);
    expect(button.textContent).toBe('Appliquer');
  });
});
