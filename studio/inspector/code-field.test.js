import { describe, expect, test } from 'bun:test';
import { codeRows, createCodeField, insertAt } from './code-field.js';

/** A hand-made element with the handlers it registered; `textarea` ones keep a value and a selection. */
function element(tag) {
  const handlers = {};
  return {
    tag,
    handlers,
    children: [],
    className: '',
    dataset: {},
    attrs: {},
    textContent: '',
    value: '',
    rows: 0,
    scrollTop: 0,
    selectionStart: 0,
    selectionEnd: 0,
    disabled: false,
    focused: false,
    ranges: [],
    setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener(name, handler) { handlers[name] = handler; },
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); return node; },
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; this.ranges.push([start, end]); },
    setRangeText(insert, from, to) { this.value = this.value.slice(0, from) + insert + this.value.slice(to); this.rangeTextCalls = (this.rangeTextCalls ?? 0) + 1; },
    dispatchEvent(event) { this.dispatched = (this.dispatched ?? []).concat(event.type); },
    focus() { this.focused = true; },
  };
}

const find = (root, predicate) => {
  if (predicate(root)) return root;
  for (const child of root.children ?? []) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return undefined;
};

function setup({ field = { key: 'js', label: 'JavaScript', language: 'javascript' }, value = 'a\nb', assetLibrary, reports, execCommand } = {}) {
  const documentRef = { createElement: (tag) => element(tag), ...(execCommand === undefined ? {} : { execCommand }) };
  const emitted = [];
  const specs = [];
  const result = createCodeField({ documentRef, field, value, emit: (key, next) => emitted.push([key, next]), assetLibrary, reports, onParamSpec: (text) => specs.push(text) });
  const textarea = find(result.el, (node) => node.tag === 'textarea');
  const gutter = find(result.el, (node) => node.className === 'code-gutter');
  const status = find(result.el, (node) => node.className === 'field-status');
  const insert = find(result.el, (node) => node.className === 'code-insert');
  return { ...result, textarea, gutter, status, insert, emitted, specs };
}
const keydown = (target, name, over = {}) => {
  const event = { key: name, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, prevented: false, preventDefault() { this.prevented = true; }, ...over };
  target.handlers.keydown(event);
  return event;
};

describe('insertAt et codeRows', () => {
  test('insertAt remplace la sélection et place le curseur après l’insertion', () => {
    expect(insertAt('abcd', { start: 1, end: 3 }, 'XY')).toEqual({ text: 'aXYd', caret: 3 });
    expect(insertAt('abcd', { start: 2, end: 2 }, 'X')).toEqual({ text: 'abXcd', caret: 3 });
  });

  test('la hauteur de la zone dépend du langage', () => {
    expect(codeRows('javascript')).toBe(14);
    expect(codeRows('glsl')).toBe(14);
    expect(codeRows('css')).toBe(10);
    expect(codeRows('html')).toBe(8);
    expect(codeRows(undefined)).toBe(8);
  });
});

describe('champ de code', () => {
  test('une zone de code étiquetée, sans correction orthographique, avec ses numéros de ligne', () => {
    const { el, textarea, gutter } = setup();
    expect(el.className).toBe('code-field');
    expect(textarea.attrs).toMatchObject({ 'aria-label': 'JavaScript', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', wrap: 'off' });
    expect(textarea.value).toBe('a\nb');
    expect(textarea.rows).toBe(14);
    expect(gutter.textContent).toBe('1\n2');
    expect(gutter.attrs['aria-hidden']).toBe('true');
  });

  test('une valeur qui n’est pas un texte donne une zone vide', () => {
    expect(setup({ value: null }).textarea.value).toBe('');
    expect(setup({ value: 12 }).textarea.value).toBe('');
  });

  test('saisir renumérote, et prévient de la valeur', () => {
    const { textarea, gutter, emitted } = setup();
    textarea.value = 'a\nb\nc';
    textarea.oninput();
    expect(gutter.textContent).toBe('1\n2\n3');
    expect(emitted).toEqual([['js', 'a\nb\nc']]);
  });

  test('les numéros ne sont réécrits que si le nombre de lignes change (pas à chaque frappe)', () => {
    const { textarea, gutter } = setup();
    const nl = String.fromCharCode(10);
    gutter.textContent = 'sentinelle';
    textarea.value = `ab${nl}b`;
    textarea.oninput();
    expect(gutter.textContent).toBe('sentinelle');
    textarea.value = `ab${nl}b${nl}c`;
    textarea.oninput();
    expect(gutter.textContent).toBe(`1${nl}2${nl}3`);
  });

  test('défiler la zone fait défiler les numéros', () => {
    const { textarea, gutter } = setup();
    textarea.scrollTop = 42;
    textarea.handlers.scroll();
    expect(gutter.scrollTop).toBe(42);
  });

  test('Tab insère l’indentation par le navigateur (pour garder son annulation) et place la sélection', () => {
    const calls = [];
    const { textarea } = setup({ value: 'ab', execCommand: (...args) => { calls.push(args); return true; } });
    textarea.selectionStart = 1;
    textarea.selectionEnd = 1;
    const event = keydown(textarea, 'Tab');
    expect(event.prevented).toBe(true);
    expect(calls).toEqual([['insertText', false, '  ']]);
    expect(textarea.ranges[0]).toEqual([1, 1]);
    expect(textarea.ranges.at(-1)).toEqual([3, 3]);
    expect(textarea.rangeTextCalls).toBeUndefined();
  });

  test('sans execCommand, le texte est remplacé sur place et un événement input est envoyé', () => {
    const { textarea } = setup({ value: 'ab', execCommand: () => false });
    textarea.selectionStart = 1;
    textarea.selectionEnd = 1;
    keydown(textarea, 'Tab');
    expect(textarea.value).toBe('a  b');
    expect(textarea.dispatched).toEqual(['input']);
    expect(textarea.ranges.at(-1)).toEqual([3, 3]);
  });

  test('une touche sans effet n’est pas annulée', () => {
    const { textarea } = setup({ value: 'ab' });
    expect(keydown(textarea, 'a').prevented).toBe(false);
  });

  test('Échap puis Tab laisse le champ (Tab n’est pas annulée) ; une perte de focus désarme la sortie', () => {
    const { textarea } = setup({ value: 'ab', execCommand: () => true });
    keydown(textarea, 'Escape');
    expect(keydown(textarea, 'Tab').prevented).toBe(false);
    expect(keydown(textarea, 'Tab').prevented).toBe(true);
    keydown(textarea, 'Escape');
    textarea.handlers.blur();
    expect(keydown(textarea, 'Tab').prevented).toBe(true);
  });

  test('le bouton d’insertion n’existe que pour le HTML, le CSS et le JavaScript, et il est désactivé sans médiathèque', () => {
    expect(setup({ field: { key: 'js', label: 'JS', language: 'javascript' } }).insert).toBeDefined();
    expect(setup({ field: { key: 'css', label: 'CSS', language: 'css' } }).insert).toBeDefined();
    expect(setup({ field: { key: 'html', label: 'HTML', language: 'html' } }).insert).toBeDefined();
    expect(setup({ field: { key: 'frag', label: 'GLSL', language: 'glsl' } }).insert).toBeUndefined();
    expect(setup({ field: { key: 'spec', label: 'Spec' } }).insert).toBeUndefined();
    expect(setup().insert.disabled).toBe(true);
    expect(setup({ assetLibrary: { open() {} } }).insert.disabled).toBe(false);
  });

  test('insérer un fichier écrit son adresse à l’endroit du curseur, garde le focus et prévient', () => {
    let choose;
    const { textarea, insert, emitted } = setup({ value: 'abcd', assetLibrary: { open: (callback) => { choose = callback; } } });
    textarea.selectionStart = 1;
    textarea.selectionEnd = 3;
    insert.onclick();
    textarea.selectionStart = 0;
    textarea.selectionEnd = 0;
    choose({ id: 'logo-1' });
    expect(textarea.value).toBe('aasset:logo-1d');
    expect(textarea.focused).toBe(true);
    expect(textarea.ranges.at(-1)).toEqual([13, 13]);
    expect(emitted).toEqual([['js', 'aasset:logo-1d']]);
  });

  test('la déclaration des réglages dit ses défauts en direct et prévient pour reconstruire le formulaire', () => {
    const { textarea, status, specs, emitted } = setup({ field: { key: 'paramSpec', label: 'Réglages' }, value: '' });
    expect(status.textContent).toBe('');
    expect(status.dataset.level).toBe('ok');
    textarea.value = 'pas du json';
    textarea.oninput();
    expect(status.dataset.level).toBe('error');
    expect(status.textContent).toContain('JSON invalide');
    expect(specs).toEqual(['pas du json']);
    expect(emitted).toEqual([['paramSpec', 'pas du json']]);
    textarea.value = '[]';
    textarea.oninput();
    expect(status.dataset.level).toBe('ok');
    expect(status.textContent).toBe('');
  });

  test('un autre champ ne lit pas de déclaration', () => {
    const { textarea, status, specs } = setup();
    textarea.value = 'pas du json';
    textarea.oninput();
    expect(specs).toEqual([]);
    expect(status.textContent).toBe('');
  });

  test('une déclaration déjà fausse est signalée dès l’affichage', () => {
    const { status } = setup({ field: { key: 'paramSpec', label: 'Réglages' }, value: '{' });
    expect(status.dataset.level).toBe('error');
  });

  test('les erreurs remontées par la page s’affichent (les trois dernières, avec leur ligne), se suivent, et se relâchent', () => {
    let listener;
    let released = false;
    const reports = {
      current: () => [{ message: 'a', line: 1 }, { message: 'b', line: null }, { message: 'c', line: 3 }, { message: 'd', line: 4 }],
      subscribe: (callback) => { listener = callback; return () => { released = true; }; },
    };
    const { status, dispose } = setup({ field: { key: 'js', label: 'JS', language: 'javascript', reports: true }, reports });
    expect(status.textContent).toBe('b\nligne 3 : c\nligne 4 : d');
    expect(status.dataset.level).toBe('error');
    listener([]);
    expect(status.textContent).toBe('');
    expect(status.dataset.level).toBe('ok');
    dispose();
    expect(released).toBe(true);
  });

  test('sans compte rendu demandé par le champ, ou sans source, rien n’est suivi', () => {
    let subscribed = 0;
    const reports = { current: () => [{ message: 'x', line: 1 }], subscribe: () => { subscribed += 1; return () => {}; } };
    const quiet = setup({ reports });
    expect(subscribed).toBe(0);
    expect(quiet.status.textContent).toBe('');
    const noSource = setup({ field: { key: 'js', label: 'JS', language: 'javascript', reports: true } });
    expect(noSource.status.textContent).toBe('');
    expect(() => noSource.dispose()).not.toThrow();
  });
});
