import { expect, test } from 'bun:test';
import { createBackgroundPresetController } from './background-preset-controller.js';

function element(overrides = {}) {
  return {
    disabled: false,
    hidden: true,
    value: '',
    textContent: '',
    className: '',
    children: [],
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = [...children]; },
    focus() {},
    scrollIntoView() {},
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name]; },
    ...overrides,
  };
}

function allText(root) {
  return [root.textContent, ...root.children.flatMap(allText)].filter(Boolean);
}

test('initialise le parcours d’import avec son panneau de détails', () => {
  const elements = {
    list: element(),
    builtinList: element(),
    name: element(),
    tags: element(),
    search: element(),
    exportButton: element(),
    importTrigger: element(),
    importInput: element(),
    importReview: element(),
    importSummary: element(),
    importDetails: element({ children: [element()] }),
    importConfirm: element(),
    importCancel: element(),
    save: element(),
    createNew: element(),
  };
  const controller = createBackgroundPresetController({
    elements,
    client: {},
    preview: {
      apply() {},
      persistNow: async () => true,
      quality: () => 'auto',
      setActivePresetId() {},
      snapshot: () => ({ activePresetId: null, current: { component: null, options: {} } }),
    },
    report: { ok() {}, error() {} },
    backgroundPageUrl: 'http://localhost:5500/background.html',
    documentRef: { createElement: () => element() },
    navigatorRef: { clipboard: { writeText: async () => {} } },
    windowRef: { setTimeout: () => 1 },
  });

  expect(() => controller.initialize()).not.toThrow();
  expect(elements.importInput.onchange).toBeFunction();
  expect(elements.importReview.hidden).toBeTrue();
  expect(elements.importDetails.children).toEqual([]);
});

test('présente chaque point de départ comme une ligne cliquable plus un ajout discret', () => {
  const elements = {
    list: element(), builtinList: element(), name: element(), tags: element(), search: element(),
    exportButton: element(), importTrigger: element(), importInput: element(), importReview: element(),
    importSummary: element(), importDetails: element(), importConfirm: element(), importCancel: element(),
    save: element(), createNew: element(),
  };
  const controller = createBackgroundPresetController({
    elements,
    client: {},
    preview: {
      apply() {}, persistNow: async () => true, quality: () => 'auto', setActivePresetId() {},
      snapshot: () => ({ activePresetId: null, current: { component: null, options: {} } }),
    },
    report: { ok() {}, error() {} },
    backgroundPageUrl: 'http://localhost:5500/background.html',
    documentRef: { createElement: () => element() },
    navigatorRef: { clipboard: { writeText: async () => {} } },
    windowRef: { setTimeout: () => 1 },
  });

  controller.initialize();

  // La ligne elle-même essaie l'ambiance : son libellé est le nom du point de départ, pas
  // « Essayer ». L'ajout reste une action séparée, réduite à un « + » avec son intitulé accessible.
  const labels = allText(elements.builtinList);
  expect(labels.some((label) => label.includes('Respiration'))).toBe(true);
  expect(labels).toContain('+');
  expect(labels).not.toContain('Essayer');

  const rows = elements.builtinList.children;
  const rowActions = rows[0].children;
  expect(rowActions.length).toBe(2);
  expect(rowActions[0].title.startsWith('Essayer')).toBe(true);
  expect(rowActions[1].getAttribute('aria-label').startsWith('Ajouter')).toBe(true);
});
