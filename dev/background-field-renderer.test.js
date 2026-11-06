import { describe, expect, test } from 'bun:test';
import {
  appendBackgroundColor,
  backgroundColorsFieldValues,
  backgroundFieldValues,
} from './background-field-renderer.js';

describe('rendu des champs de fond', () => {
  test('prépare chaque champ avec la valeur courante ou son défaut', () => {
    const values = backgroundFieldValues('rain', {
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

import { CODE_TEMPLATES } from '../src/components/code-templates.js';
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
    renderer.render('rain', { audioReactive: value });
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

describe('champs de la couche Code : code et réglages déclarés', () => {
  /** Un élément qui retient son type de balise, ses enfants et ce qu'on lui pose. */
  function node(tag) {
    return {
      tag,
      children: [],
      style: {},
      dataset: {},
      value: '',
      textContent: '',
      append(...nodes) { this.children.push(...nodes); },
      appendChild(child) { this.children.push(child); return child; },
      replaceChildren(...nodes) { this.children = [...nodes]; },
      setAttribute(name, value) { this[`attr:${name}`] = value; },
      addEventListener(type, listener) { this.listeners = { ...this.listeners, [type]: listener }; },
      focus() {},
      setSelectionRange(start, end) { this.selection = [start, end]; },
      classList: { add() {}, remove() {}, toggle() {} },
    };
  }
  const all = (root) => [root, ...root.children.flatMap(all)];
  const byClass = (root, className) => all(root).filter((entry) => entry.className === className);
  const textareas = (root) => all(root).filter((entry) => entry.tag === 'textarea');
  const field = (root, label) => textareas(root).find((entry) => entry['attr:aria-label'] === label);
  /** Les étiquettes (nom des champs) que la section « réglages » affiche, dans l'ordre. */
  const paramLabels = (root) => byClass(root, 'params-field').flatMap((host) => host.children.filter((entry) => entry.tag === 'label').map((entry) => entry.textContent));
  /** Le compte rendu (sous un champ de code) du champ dont on donne la zone de saisie. */
  const statusOf = (root, area) => byClass(root, 'code-field').find((wrapper) => all(wrapper).includes(area)).children.find((entry) => entry.className === 'field-status');

  function setup({ assetLibrary, onApply, currentOptions } = {}) {
    const changes = [];
    const container = node('div');
    const renderer = createBackgroundFieldRenderer({
      container: /** @type {*} */ (container),
      documentRef: /** @type {*} */ ({ createElement: node }),
      onChange: (key, next) => changes.push([key, next]),
      ...(assetLibrary === undefined ? {} : { assetLibrary }),
      ...(onApply === undefined ? {} : { onApply }),
      ...(currentOptions === undefined ? {} : { currentOptions }),
    });
    return { container, renderer, changes };
  }

  const SPEC = JSON.stringify([
    { key: 'actif', label: 'Actif', type: 'boolean', default: true },
    { key: 'mode', label: 'Mode', type: 'select', choices: ['a', 'b'], default: 'a' },
    { key: 'titre', label: 'Titre', type: 'text', default: 'Bonjour' },
  ]);
  const base = { html: '', css: '', js: '', paramSpec: '[]', params: {} };

  test('le code est une zone de saisie par langage, dans l’ordre, avec ses valeurs', () => {
    const { container, renderer } = setup();
    renderer.render('code', { ...base, html: '<b>x</b>', css: 'b{}', js: 'let a', paramSpec: SPEC });
    expect(textareas(container).map((area) => area['attr:aria-label'])).toEqual(['HTML', 'CSS', 'JavaScript', 'Réglages exposés (JSON)']);
    expect(field(container, 'HTML').value).toBe('<b>x</b>');
    expect(field(container, 'JavaScript').value).toBe('let a');
    expect(field(container, 'HTML')['attr:spellcheck']).toBe('false');
  });

  test('taper dans une zone publie le texte entier dans la bonne option', () => {
    const { container, renderer, changes } = setup();
    renderer.render('code', base);
    field(container, 'CSS').value = 'a{color:red}';
    field(container, 'CSS').oninput();
    field(container, 'JavaScript').value = 'overlay.on("alert", f)';
    field(container, 'JavaScript').oninput();
    expect(changes).toEqual([['css', 'a{color:red}'], ['js', 'overlay.on("alert", f)']]);
  });

  test('chaque réglage déclaré devient un champ, avec la valeur réglée ou son défaut', () => {
    const { container, renderer } = setup();
    renderer.render('code', { ...base, paramSpec: SPEC, params: { actif: false, titre: 'Salut' } });
    expect(paramLabels(container)).toEqual(['Actif', 'Mode', 'Titre']);
    const host = byClass(container, 'params-field')[0];
    const checkbox = all(host).find((entry) => entry.type === 'checkbox');
    const text = all(host).find((entry) => entry.type === 'text');
    const select = all(host).find((entry) => entry.tag === 'select');
    expect(checkbox.checked).toBe(false);
    expect(text.value).toBe('Salut');
    expect(select.children.map((option) => option.value)).toEqual(['a', 'b']);
  });

  test('une liste montre le libellé de chaque choix et garde l’identifiant comme valeur ; celle d’un réglage déclaré par le code montre ses choix tels quels', () => {
    const { container, renderer, changes } = setup();
    renderer.render('dotgrid', { colorMode: 'noise' });
    const colorMode = all(container).find((entry) => entry.tag === 'select' && entry['attr:aria-label'] === 'Mode de couleur');
    expect(colorMode.children.map((option) => [option.value, option.textContent, option.selected])).toEqual([['flat', 'Uni', false], ['noise', 'Dégradé animé', true], ['glow', 'Halo', false]]);
    colorMode.value = 'glow';
    colorMode.onchange();
    expect(changes).toEqual([['colorMode', 'glow']]);
    renderer.render('code', { ...base, paramSpec: SPEC });
    const declared = all(byClass(container, 'params-field')[0]).find((entry) => entry.tag === 'select');
    expect(declared.children.map((option) => [option.value, option.textContent])).toEqual([['a', 'a'], ['b', 'b']]);
  });

  test('changer un réglage publie tout l’objet des valeurs (celles qui n’ont pas bougé restent)', () => {
    const { container, renderer, changes } = setup();
    renderer.render('code', { ...base, paramSpec: SPEC, params: { titre: 'Salut' } });
    const host = byClass(container, 'params-field')[0];
    const checkbox = all(host).find((entry) => entry.type === 'checkbox');
    checkbox.checked = false;
    checkbox.onchange();
    expect(changes.at(-1)).toEqual(['params', { actif: false, mode: 'a', titre: 'Salut' }]);
    const text = all(host).find((entry) => entry.type === 'text');
    text.value = 'Coucou';
    text.oninput();
    expect(changes.at(-1)).toEqual(['params', { actif: false, mode: 'a', titre: 'Coucou' }]);
  });

  test('modifier la déclaration reconstruit les champs sans rouvrir le formulaire, et garde les valeurs des clés qui restent', () => {
    const { container, renderer, changes } = setup();
    renderer.render('code', { ...base, paramSpec: SPEC, params: { titre: 'Salut' } });
    const area = field(container, 'Réglages exposés (JSON)');
    area.value = JSON.stringify([{ key: 'titre', label: 'Titre', type: 'text', default: 'Bonjour' }, { key: 'taille', label: 'Taille', type: 'text', default: '12' }]);
    area.oninput();
    expect(changes.at(-1)).toEqual(['paramSpec', area.value]);
    expect(paramLabels(container)).toEqual(['Titre', 'Taille']);
    const texts = all(byClass(container, 'params-field')[0]).filter((entry) => entry.type === 'text');
    expect(texts.map((entry) => entry.value)).toEqual(['Salut', '12']);
  });

  test('une déclaration sans réglage le dit au lieu de laisser un trou', () => {
    const { container, renderer } = setup();
    renderer.render('code', base);
    const host = byClass(container, 'params-field')[0];
    expect(host.children[0].textContent).toContain('Aucun réglage déclaré');
  });

  test('les défauts de la déclaration sont dits sous le champ, en direct', () => {
    const { container, renderer } = setup();
    renderer.render('code', { ...base, paramSpec: SPEC });
    const area = field(container, 'Réglages exposés (JSON)');
    expect(statusOf(container, area).dataset.level).toBe('ok');
    area.value = '[ { "key": "Mauvaise Clé", "type": "number", "default": 1 } ]';
    area.oninput();
    expect(statusOf(container, area).dataset.level).toBe('error');
    expect(statusOf(container, area).textContent).toContain('la clé doit commencer par une minuscule');
    area.value = '[ { ';
    area.oninput();
    expect(statusOf(container, area).textContent).toContain('JSON invalide');
  });

  test('les erreurs du code s’affichent sous le champ JavaScript avec leur ligne, se mettent à jour, et cessent d’être suivies au rendu suivant', () => {
    const { container, renderer } = setup();
    let listener = null;
    let unsubscribed = 0;
    const reports = { current: () => [{ message: 'x is not defined', line: 3, column: null }], subscribe: (next) => { listener = next; return () => { unsubscribed += 1; }; } };
    renderer.render('code', base, { reports });
    const area = field(container, 'JavaScript');
    expect(statusOf(container, area).textContent).toBe('ligne 3 : x is not defined');
    expect(statusOf(container, area).dataset.level).toBe('error');
    listener([]);
    expect(statusOf(container, area).textContent).toBe('');
    expect(statusOf(container, area).dataset.level).toBe('ok');
    listener([{ message: 'a', line: null, column: null }]);
    expect(statusOf(container, area).textContent).toBe('a');
    renderer.render('rain', {});
    expect(unsubscribed).toBe(1);
  });

  test('« Insérer un fichier » écrit asset:<identifiant> à l’endroit du curseur et publie le texte', () => {
    const opened = [];
    const assetLibrary = { assets: () => [], subscribe: () => () => {}, open: (choose, accept) => opened.push({ choose, accept }) };
    const { container, renderer, changes } = setup({ assetLibrary });
    renderer.render('code', { ...base, html: '<img src="">' });
    const area = field(container, 'HTML');
    area.selectionStart = 10;
    area.selectionEnd = 10;
    const insert = byClass(container, 'code-field').find((wrapper) => all(wrapper).includes(area)).children.find((entry) => entry.className === 'code-insert');
    insert.onclick();
    expect(opened).toHaveLength(1);
    expect(opened[0].accept).toBeUndefined();
    opened[0].choose({ id: 'a'.repeat(32) });
    expect(area.value).toBe(`<img src="asset:${'a'.repeat(32)}">`);
    expect(area.selection).toEqual([10 + 6 + 32, 10 + 6 + 32]);
    expect(changes.at(-1)).toEqual(['html', area.value]);
  });

  describe('modèle de départ', () => {
    const starter = (container) => {
      const row = byClass(container, 'starter-row')[0];
      const [select, apply] = row.children;
      return { select, apply, help: container.children.find((entry) => entry.className === 'field-help' && entry.attr_role !== undefined) ?? all(container).find((entry) => entry.tag === 'p' && entry['attr:role'] === 'status') };
    };

    test('only a Code layer has one, and only when the page can apply it', () => {
      const withoutApply = setup();
      withoutApply.renderer.render('code', base);
      expect(byClass(withoutApply.container, 'starter-row')).toHaveLength(0);
      const withApply = setup({ onApply: () => {} });
      withApply.renderer.render('code', base);
      expect(byClass(withApply.container, 'starter-row')).toHaveLength(1);
      withApply.renderer.render('rain', {});
      expect(byClass(withApply.container, 'starter-row')).toHaveLength(0);
    });

    test('lists the templates, and applies the chosen one over untouched code in one patch that also resets the settings values', () => {
      const patches = [];
      const { container, renderer } = setup({ onApply: (patch) => patches.push(patch), currentOptions: () => ({}) });
      renderer.render('code', { ...base, params: { couleur: '#ff0000' } });
      const { select, apply } = starter(container);
      expect(select.children.map((option) => option.value)).toEqual(['', ...CODE_TEMPLATES.map(({ id }) => id)]);
      expect(apply.disabled).toBe(true);
      select.value = 'particules';
      select.listeners.change();
      expect(apply.disabled).toBe(false);
      apply.listeners.click();
      const particles = CODE_TEMPLATES.find(({ id }) => id === 'particules');
      expect(patches).toEqual([{ html: particles.html, css: particles.css, js: particles.js, paramSpec: particles.paramSpec, params: {} }]);
    });

    test('code the author wrote is not replaced by the first click: it asks, and the second click applies', () => {
      const patches = [];
      let current = { ...base, js: '// mon code' };
      const { container, renderer } = setup({ onApply: (patch) => patches.push(patch), currentOptions: () => current });
      renderer.render('code', base);
      const { select, apply } = starter(container);
      select.value = 'cube-webgl';
      select.listeners.change();
      apply.listeners.click();
      expect(patches).toHaveLength(0);
      expect(apply.textContent).toBe('Remplacer mon code ?');
      apply.listeners.click();
      expect(patches).toHaveLength(1);
      current = base;
    });

    test('the state of the code is read when clicking, not when the form was built', () => {
      const patches = [];
      let current = {};
      const { container, renderer } = setup({ onApply: (patch) => patches.push(patch), currentOptions: () => current });
      renderer.render('code', base);
      const { select, apply } = starter(container);
      select.value = 'particules';
      select.listeners.change();
      current = { ...base, js: '// écrit depuis' };
      apply.listeners.click();
      expect(patches).toHaveLength(0);
    });

    test('choosing another template forgets a pending confirmation', () => {
      const patches = [];
      const { container, renderer } = setup({ onApply: (patch) => patches.push(patch), currentOptions: () => ({ ...base, js: '// à moi' }) });
      renderer.render('code', base);
      const { select, apply } = starter(container);
      select.value = 'cube-webgl';
      select.listeners.change();
      apply.listeners.click();
      select.value = 'particules';
      select.listeners.change();
      expect(apply.textContent).toBe('Appliquer');
      apply.listeners.click();
      expect(patches).toHaveLength(0);
    });
  });

  test('« Insérer un fichier » est inactif sans médiathèque, et la déclaration des réglages n’en a pas', () => {
    const { container, renderer } = setup();
    renderer.render('code', base);
    const inserts = byClass(container, 'code-insert');
    expect(inserts).toHaveLength(3);
    expect(inserts.every((button) => button.disabled === true)).toBe(true);
  });
});
