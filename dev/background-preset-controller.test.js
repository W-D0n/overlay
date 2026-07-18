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
    ...overrides,
  };
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
