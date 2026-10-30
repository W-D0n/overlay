import { expect, test } from 'bun:test';
import { createBackgroundPresetController } from './background-preset-controller.js';
import { STATIC_PORT } from '../ports.config.js';

const backgroundPageUrl = `http://localhost:${STATIC_PORT}/background.html`;

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
    // Les vignettes stylent et écoutent leur élément : le faux DOM doit offrir la même surface.
    style: {},
    dataset: {},
    addEventListener() {},
    remove() {},
    querySelector() { return null; },
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
     
      setActivePresetId() {},
      snapshot: () => ({ activePresetId: null, current: { component: null, options: {} } }),
    },
    report: { ok() {}, error() {} },
    backgroundPageUrl,
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
      apply() {}, persistNow: async () => true, setActivePresetId() {},
      snapshot: () => ({ activePresetId: null, current: { component: null, options: {} } }),
    },
    report: { ok() {}, error() {} },
    backgroundPageUrl,
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

  // Une ligne = sa vignette, sa zone cliquable, son bouton d'ajout.
  const rows = elements.builtinList.children;
  const [thumbnail, tryButton, addButton] = rows[0].children;
  expect(rows[0].children.length).toBe(3);
  expect(thumbnail.className).toBe('preset-thumb');
  expect(tryButton.title.startsWith('Essayer')).toBe(true);
  expect(addButton.getAttribute('aria-label').startsWith('Ajouter')).toBe(true);
});

test('re-rendre les presets personnels ne détruit pas les vignettes des points de départ', () => {
  const removed = [];
  const createElement = () => element({ remove() { removed.push(this); } });
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
      apply() {}, persistNow: async () => true, setActivePresetId() {},
      snapshot: () => ({ activePresetId: null, current: { component: null, options: {} } }),
    },
    report: { ok() {}, error() {} },
    backgroundPageUrl,
    documentRef: { createElement },
    navigatorRef: { clipboard: { writeText: async () => {} } },
    windowRef: { setTimeout: () => 1 },
  });

  controller.initialize();
  const builtinThumbnails = elements.builtinList.children.map((row) => row.children[0]);
  expect(builtinThumbnails.length).toBeGreaterThan(0);

  controller.renderPresets([{ id: 'a', name: 'Perso', component: 'RainBackground', options: {} }]);
  expect(builtinThumbnails.filter((thumbnail) => removed.includes(thumbnail))).toEqual([]);

  // Une recherche re-rend la liste des points de départ : ses anciennes vignettes sont alors libérées.
  elements.search.value = 'respiration';
  elements.search.oninput();
  expect(removed.length).toBeGreaterThan(0);
  const survivors = elements.builtinList.children.map((row) => row.children[0]);
  expect(survivors.filter((thumbnail) => removed.includes(thumbnail))).toEqual([]);
});

function draftSetup({ drafts, activePresetId = null }) {
  const elements = {
    list: element(), builtinList: element(), name: element(), tags: element(), search: element(),
    exportButton: element(), importTrigger: element(), importInput: element(), importReview: element(),
    importSummary: element(), importDetails: element(), importConfirm: element(), importCancel: element(),
    save: element(), createNew: element(),
  };
  const applied = [];
  const calls = [];
  const controller = createBackgroundPresetController({
    elements,
    client: {
      savePreset: async () => { calls.push('savePreset'); },
      readState: async () => ({ presets: [{ id: 'a', name: 'Perso', component: 'rain', options: { speed: 1 } }] }),
    },
    preview: {
      apply: (next, presetId, asDraft) => applied.push({ next, presetId, asDraft }),
      persistNow: async () => true,
      setActivePresetId() {},
      snapshot: () => ({ activePresetId, current: { component: 'rain', options: { speed: 1 } }, transition: {}, showBranding: true }),
    },
    drafts,
    report: { ok() {}, error() {} },
    backgroundPageUrl,
    documentRef: { createElement: () => element() },
    navigatorRef: { clipboard: { writeText: async () => {} } },
    windowRef: { setTimeout: () => 1 },
  });
  controller.initialize();
  controller.renderPresets([{ id: 'a', name: 'Perso', component: 'rain', options: { speed: 1 } }]);
  const row = elements.list.children[0];
  const [, load, , , line] = row.children;
  return { elements, controller, applied, calls, row, load, line, discard: line.children[1] };
}

function fakeDrafts(initial = {}) {
  const store = new Map(Object.entries(initial));
  const log = [];
  return {
    store, log,
    has: (id) => store.has(id),
    get: (id) => store.get(id) ?? null,
    flush: () => { log.push('flush'); return Promise.resolve(); },
    forget: (id) => { log.push(`forget:${id}`); store.delete(id); },
    discard: async (id) => { log.push(`discard:${id}`); store.delete(id); },
  };
}

test('la pastille « brouillon » et l’abandon n’apparaissent que sur un preset qui a un brouillon', () => {
  const drafts = fakeDrafts({ a: { component: 'bubble', options: {} } });
  const { controller, line } = draftSetup({ drafts });
  expect(line.hidden).toBe(false);

  drafts.store.delete('a');
  controller.syncDraftMarks();
  expect(line.hidden).toBe(true);
});

test('sans brouillon, cliquer un preset applique sa version enregistrée', () => {
  const drafts = fakeDrafts();
  const { load, applied } = draftSetup({ drafts });
  load.onclick();
  expect(applied).toHaveLength(1);
  expect(applied[0]).toMatchObject({ presetId: 'a', asDraft: true, next: { component: 'rain', options: { speed: 1 } } });
});

test('avec un brouillon, cliquer le preset restaure ses réglages non enregistrés, après avoir envoyé ceux en attente', () => {
  const drafts = fakeDrafts({ a: { component: 'bubble', options: { count: 9 }, showBranding: false } });
  const { load, applied } = draftSetup({ drafts });
  load.onclick();
  expect(drafts.log).toEqual(['flush']);
  expect(applied[0].next).toMatchObject({ id: 'a', name: 'Perso', component: 'bubble', options: { count: 9 }, showBranding: false });
});

test('« Revenir à la version enregistrée » abandonne le brouillon et réaffiche le preset s’il est actif', async () => {
  const drafts = fakeDrafts({ a: { component: 'bubble', options: {} } });
  const { discard, applied } = draftSetup({ drafts, activePresetId: 'a' });
  await discard.onclick();
  expect(drafts.log).toEqual(['discard:a']);
  expect(applied).toHaveLength(1);
  expect(applied[0].next.component).toBe('rain');
});

test('« Revenir » sur un preset non actif ne change pas l’aperçu', async () => {
  const drafts = fakeDrafts({ a: { component: 'bubble', options: {} } });
  const { discard, applied } = draftSetup({ drafts, activePresetId: null });
  await discard.onclick();
  expect(applied).toEqual([]);
});

test('« Mettre à jour » oublie le brouillon du preset actif, pour qu’un envoi en attente ne le recrée pas', async () => {
  const drafts = fakeDrafts({ a: { component: 'bubble', options: {} } });
  const { elements, calls } = draftSetup({ drafts, activePresetId: 'a' });
  elements.name.value = 'Perso';
  await elements.save.onclick();
  expect(calls).toEqual(['savePreset']);
  expect(drafts.log).toContain('forget:a');
});

test('sans brouillons fournis, la liste reste utilisable', () => {
  const { load, applied, line } = draftSetup({ drafts: undefined });
  expect(line.hidden).toBe(true);
  load.onclick();
  expect(applied).toHaveLength(1);
});
