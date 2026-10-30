// @ts-check
/**
 * dev/custom-commands-controller.js — L'interface des commandes personnalisées : le gestionnaire (liste, exécuter, modifier,
 * dupliquer, supprimer), l'éditeur (nom, raccourci capturé au clavier, étapes ordonnables), l'enregistrement d'une macro et
 * l'import / export en JSON.
 *
 * Les définitions vivent dans le stockage (`custom-commands.js`) ; ce contrôleur les inscrit dans le registre de commandes
 * à chaque changement, de sorte que la palette, le menu clic droit et l'aide les montrent sans rien savoir d'elles.
 * L'enregistrement capte les commandes du registre (palette, raccourcis, menu clic droit) et les gestes directs sur les
 * panneaux, l'inspecteur et l'aperçu (`operation-steps.js`) ; les valeurs d'une étape geste se corrigent dans l'éditeur.
 */
import {
  CUSTOM_PREFIX, MAX_STEPS, checkShortcut, isStepAllowed, parseCustomCommands, shortcutFromEvent, toCommand, uniqueCustomId, validateCustomCommand,
} from './custom-commands.js';
import { describeStep, isOperationStep, stepFields, withStepValue } from './operation-steps.js';

/**
 * @param {{
 *   registry: ReturnType<typeof import('./command-registry.js').createCommandRegistry>,
 *   store: ReturnType<typeof import('./custom-commands.js').createCustomCommandStore>,
 *   recorder: ReturnType<typeof import('./custom-commands.js').createMacroRecorder>,
 *   batch: <T>(label: string, run: () => T) => T,
 *   editor: import('./scene-editor.js').SceneEditor,
 *   kindLabel: (kind: string) => string,
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   elements: {
 *     dialog: HTMLDialogElement, list: HTMLElement, empty: HTMLElement,
 *     create: HTMLButtonElement, record: HTMLButtonElement, importButton: HTMLButtonElement, exportButton: HTMLButtonElement, close: HTMLButtonElement,
 *     editor: HTMLElement, name: HTMLInputElement, shortcut: HTMLButtonElement, shortcutClear: HTMLButtonElement,
 *     steps: HTMLElement, stepSearch: HTMLInputElement, stepResults: HTMLElement, errors: HTMLElement,
 *     save: HTMLButtonElement, test: HTMLButtonElement, cancel: HTMLButtonElement,
 *     io: HTMLElement, ioText: HTMLTextAreaElement, ioConfirm: HTMLButtonElement, ioCopy: HTMLButtonElement, ioCancel: HTMLButtonElement, ioStatus: HTMLElement,
 *     bar: HTMLElement, barCount: HTMLElement, barSteps: HTMLElement, barFinish: HTMLButtonElement, barCancel: HTMLButtonElement,
 *   },
 *   documentRef?: Document,
 *   navigatorRef?: Navigator,
 * }} input
 */
export function createCustomCommandsController(input) {
  const documentRef = input.documentRef ?? document;
  const navigatorRef = input.navigatorRef ?? navigator;
  const { registry, store, recorder, elements } = input;

  /** @type {{ id: string | null, name: string, steps: import('./custom-commands.js').CommandStep[], shortcut: string }} */
  let draft = { id: null, name: '', steps: [], shortcut: '' };
  /** Le volet affiché : la liste ne se redessine que si elle est visible. @type {'list' | 'editor' | 'io'} */
  let pane = 'list';
  let capturing = false;
  /** Le mode d'import / export en cours : `import` ou `export`. @type {'import' | 'export' | null} */
  let ioMode = null;

  /** @param {string} id */
  const labelOf = (id) => registry.list().find((command) => command.id === id)?.label ?? id;
  /** @param {import('./custom-commands.js').CommandStep} step */
  const stepLabel = (step) => (isOperationStep(step) ? describeStep(step, input.kindLabel) : labelOf(step));
  const knownIds = () => new Set(registry.list().map((command) => command.id));

  /** Les raccourcis pris par les commandes du registre, hors celle qu'on édite. @param {string | null} exceptId */
  function takenShortcuts(exceptId) {
    const taken = new Map(registry.list().filter((command) => command.shortcut !== undefined && command.id !== exceptId).map((command) => [/** @type {string} */ (command.shortcut), command.label]));
    // Alias gérés hors registre : Ctrl+Y rétablit aussi.
    taken.set('Ctrl+Y', 'Rétablir');
    return taken;
  }

  // ── Registre ────────────────────────────────────────────────────────────

  /** Réinscrit les commandes personnalisées dans le registre à partir du stockage. */
  function syncRegistry() {
    for (const command of registry.list()) if (command.id.startsWith(CUSTOM_PREFIX)) registry.unregister(command.id);
    for (const definition of store.list()) {
      try {
        registry.register(toCommand(definition, { registry, batch: input.batch, labelOf, report: input.report, editor: input.editor, kindLabel: input.kindLabel }));
      } catch {
        // Un identifiant déjà pris (stockage édité à la main) : la commande est ignorée plutôt que de casser le Studio.
      }
    }
  }

  // ── Liste ───────────────────────────────────────────────────────────────

  /** @param {import('./custom-commands.js').CustomCommand} definition */
  function renderCard(definition) {
    const card = documentRef.createElement('li');
    card.className = 'cc-card';
    card.dataset.id = definition.id;
    const title = documentRef.createElement('div');
    title.className = 'cc-card-title';
    const name = documentRef.createElement('strong');
    name.textContent = definition.name;
    title.appendChild(name);
    if (definition.shortcut !== undefined) {
      const key = documentRef.createElement('kbd');
      key.textContent = definition.shortcut;
      title.appendChild(key);
    }
    const summary = documentRef.createElement('div');
    summary.className = 'cc-card-steps';
    summary.textContent = `${definition.steps.length} étape${definition.steps.length > 1 ? 's' : ''} : ${definition.steps.map(stepLabel).join(' → ')}`;
    const actions = documentRef.createElement('div');
    actions.className = 'cc-card-actions';
    const button = (/** @type {string} */ label, /** @type {string} */ action) => {
      const el = documentRef.createElement('button');
      el.type = 'button';
      el.textContent = label;
      el.dataset.action = action;
      return el;
    };
    const run = button('Exécuter', 'run');
    run.addEventListener('click', () => { elements.dialog.close(); registry.run(definition.id); });
    const edit = button('Modifier', 'edit');
    edit.addEventListener('click', () => openEditor(definition));
    const duplicate = button('Dupliquer', 'duplicate');
    duplicate.addEventListener('click', () => {
      const { shortcut: _dropped, ...rest } = definition;
      const copyName = `${definition.name} (copie)`.slice(0, 40);
      store.save({ ...rest, id: uniqueCustomId(copyName, store.list().map(({ id }) => id)), name: copyName });
      syncRegistry();
      renderList();
    });
    const remove = button('Supprimer', 'remove');
    remove.addEventListener('click', () => {
      actions.replaceChildren();
      const label = documentRef.createElement('span');
      label.textContent = `Supprimer « ${definition.name} » ?`;
      const yes = button('Oui', 'remove-confirm');
      yes.addEventListener('click', () => { store.remove(definition.id); syncRegistry(); renderList(); });
      const no = button('Non', 'remove-cancel');
      no.addEventListener('click', renderList);
      actions.append(label, yes, no);
    });
    actions.append(run, edit, duplicate, remove);
    card.append(title, summary, actions);
    return card;
  }

  function renderList() {
    const list = store.list();
    elements.list.replaceChildren(...list.map(renderCard));
    elements.empty.hidden = list.length > 0;
  }

  // ── Éditeur ─────────────────────────────────────────────────────────────

  function showPane(/** @type {'list' | 'editor' | 'io'} */ next) {
    pane = next;
    elements.editor.hidden = next !== 'editor';
    elements.io.hidden = next !== 'io';
    elements.list.hidden = next !== 'list';
    elements.empty.hidden = next !== 'list' || store.list().length > 0;
    elements.create.disabled = next !== 'list';
    elements.record.disabled = next !== 'list';
    elements.importButton.disabled = next !== 'list';
    elements.exportButton.disabled = next !== 'list';
  }

  /** @param {import('./custom-commands.js').CustomCommand | null} definition */
  function openEditor(definition, steps = definition?.steps ?? []) {
    draft = { id: definition?.id ?? null, name: definition?.name ?? '', steps: [...steps], shortcut: definition?.shortcut ?? '' };
    elements.name.value = draft.name;
    elements.stepSearch.value = '';
    showPane('editor');
    if (!elements.dialog.open) openDialog();
    renderEditor();
    elements.name.focus();
  }

  function validation() {
    const others = store.list().filter((other) => other.id !== draft.id);
    return validateCustomCommand(
      { id: draft.id ?? undefined, name: draft.name, steps: draft.steps, ...(draft.shortcut === '' ? {} : { shortcut: draft.shortcut }) },
      { knownIds: knownIds(), taken: takenShortcuts(draft.id), others },
    );
  }

  function renderEditor() {
    elements.shortcut.textContent = capturing ? 'Appuyez sur la combinaison… (Échap pour annuler)' : draft.shortcut === '' ? 'Aucun raccourci — cliquer pour en définir un' : draft.shortcut;
    elements.shortcut.classList.toggle('is-capturing', capturing);
    elements.shortcutClear.hidden = draft.shortcut === '';

    elements.steps.replaceChildren();
    draft.steps.forEach((step, index) => {
      const row = documentRef.createElement('li');
      row.className = 'cc-step';
      const position = documentRef.createElement('span');
      position.className = 'cc-step-index';
      position.textContent = String(index + 1);
      const label = documentRef.createElement('span');
      label.className = 'cc-step-label';
      label.textContent = stepLabel(step);
      const tools = documentRef.createElement('span');
      tools.className = 'cc-step-tools';
      const tool = (/** @type {string} */ text, /** @type {string} */ title, /** @type {() => void} */ onClick, disabled = false) => {
        const el = documentRef.createElement('button');
        el.type = 'button';
        el.textContent = text;
        el.title = title;
        el.setAttribute('aria-label', `${title} : ${stepLabel(step)}`);
        el.disabled = disabled;
        el.addEventListener('click', onClick);
        return el;
      };
      tools.append(
        tool('↑', 'Monter l’étape', () => { [draft.steps[index - 1], draft.steps[index]] = [draft.steps[index], draft.steps[index - 1]]; renderEditor(); }, index === 0),
        tool('↓', 'Descendre l’étape', () => { [draft.steps[index + 1], draft.steps[index]] = [draft.steps[index], draft.steps[index + 1]]; renderEditor(); }, index === draft.steps.length - 1),
        tool('✕', 'Retirer l’étape', () => { draft.steps.splice(index, 1); renderEditor(); }),
      );
      row.append(position, label, tools);
      if (isOperationStep(step)) row.appendChild(renderFields(step, index));
      elements.steps.appendChild(row);
    });
    if (draft.steps.length === 0) {
      const empty = documentRef.createElement('li');
      empty.className = 'cc-step-empty';
      empty.textContent = 'Aucune étape : cherchez une commande ci-dessous pour l’ajouter.';
      elements.steps.appendChild(empty);
    }

    renderStepResults();
    const result = validation();
    elements.errors.replaceChildren(...(result.ok ? [] : result.errors.map((message) => {
      const line = documentRef.createElement('li');
      line.textContent = message;
      return line;
    })));
    elements.save.disabled = !result.ok;
    elements.test.disabled = draft.steps.length === 0;
  }

  /**
   * Les valeurs d'une étape geste, corrigeables sur place.
   * @param {import('./operation-steps.js').OperationStep} step
   * @param {number} index
   */
  function renderFields(step, index) {
    const box = documentRef.createElement('div');
    box.className = 'cc-step-fields';
    for (const field of stepFields(step)) {
      const wrap = documentRef.createElement('label');
      wrap.className = 'cc-field';
      const caption = documentRef.createElement('span');
      caption.textContent = field.type === 'percent' ? `${field.label} (%)` : field.label;
      const control = documentRef.createElement('input');
      control.dataset.key = field.key;
      if (field.type === 'boolean') {
        control.type = 'checkbox';
        control.checked = field.value === true;
      } else if (field.type === 'text') {
        control.type = 'text';
        control.value = String(field.value);
      } else {
        control.type = 'number';
        control.step = field.type === 'percent' ? '0.1' : 'any';
        control.value = String(field.type === 'percent' ? Math.round(Number(field.value) * 1000) / 10 : field.value);
      }
      control.addEventListener('change', () => {
        /** @type {number | boolean | string} */
        let value;
        if (field.type === 'boolean') value = control.checked;
        else if (field.type === 'text') value = control.value;
        else {
          const typed = Number(control.value);
          if (control.value.trim() === '' || !Number.isFinite(typed)) return;
          value = field.type === 'percent' ? typed / 100 : typed;
        }
        draft.steps[index] = withStepValue(step, field.key, value);
        renderEditor();
      });
      wrap.append(caption, control);
      box.appendChild(wrap);
    }
    return box;
  }

  function renderStepResults() {
    const query = elements.stepSearch.value;
    const found = registry.search(query).filter((command) => isStepAllowed(command.id)).slice(0, 8);
    elements.stepResults.replaceChildren();
    if (query.trim() === '' && draft.steps.length > 0) return;
    for (const command of found) {
      const item = documentRef.createElement('li');
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'cc-result';
      button.dataset.command = command.id;
      button.disabled = draft.steps.length >= MAX_STEPS;
      const group = documentRef.createElement('span');
      group.className = 'cc-result-group';
      group.textContent = command.group;
      const label = documentRef.createElement('span');
      label.textContent = command.label;
      button.append(group, label);
      button.addEventListener('click', () => {
        draft.steps.push(command.id);
        elements.stepSearch.value = '';
        renderEditor();
        elements.stepSearch.focus();
      });
      item.appendChild(button);
      elements.stepResults.appendChild(item);
    }
  }

  elements.name.addEventListener('input', () => { draft.name = elements.name.value; renderEditor(); });
  elements.stepSearch.addEventListener('input', renderStepResults);
  elements.stepSearch.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    /** @type {HTMLButtonElement | null} */ (elements.stepResults.querySelector('.cc-result:not(:disabled)'))?.click();
  });

  // Capture du raccourci : la prochaine combinaison pressée est la bonne.
  elements.shortcut.addEventListener('click', () => {
    capturing = true;
    renderEditor();
    elements.shortcut.focus();
  });
  elements.shortcut.addEventListener('keydown', (event) => {
    if (!capturing) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      capturing = false;
      renderEditor();
      return;
    }
    const shortcut = shortcutFromEvent(event);
    if (shortcut === null) return;
    capturing = false;
    draft.shortcut = shortcut;
    renderEditor();
  });
  elements.shortcut.addEventListener('blur', () => { if (capturing) { capturing = false; renderEditor(); } });
  elements.shortcutClear.addEventListener('click', () => { draft.shortcut = ''; renderEditor(); });

  elements.save.addEventListener('click', () => {
    const result = validation();
    if (!result.ok) return;
    const id = draft.id ?? uniqueCustomId(result.command.name, store.list().map((command) => command.id));
    store.save({ ...result.command, id });
    syncRegistry();
    showPane('list');
    renderList();
    input.report.ok(`commande « ${result.command.name} » enregistrée`);
  });
  elements.test.addEventListener('click', () => {
    const result = validation();
    const probe = result.ok ? result.command : { id: 'custom.essai', name: draft.name.trim() || 'Essai', steps: draft.steps };
    const command = toCommand(probe, { registry, batch: input.batch, labelOf, report: input.report, editor: input.editor, kindLabel: input.kindLabel });
    elements.dialog.close();
    command.run();
  });
  elements.cancel.addEventListener('click', () => { capturing = false; showPane('list'); renderList(); });
  elements.create.addEventListener('click', () => openEditor(null));

  // ── Enregistrement ──────────────────────────────────────────────────────

  function renderBar() {
    const recording = recorder.isRecording();
    elements.bar.hidden = !recording;
    if (!recording) return;
    const steps = recorder.steps();
    elements.barCount.textContent = `${steps.length} étape${steps.length > 1 ? 's' : ''}`;
    const skipped = recorder.skipped();
    const note = skipped.length === 0 ? '' : ` — non enregistré : ${skipped.join(' ; ')}`;
    elements.barSteps.textContent = (steps.length === 0 ? 'Exécutez des commandes ou agissez directement : panneaux, inspecteur, aperçu.' : steps.map(stepLabel).join(' → ')) + note;
  }
  recorder.subscribe(renderBar);
  elements.record.addEventListener('click', () => { elements.dialog.close(); recorder.start(); });
  elements.barCancel.addEventListener('click', () => recorder.cancel());
  elements.barFinish.addEventListener('click', () => {
    const steps = recorder.finish();
    if (steps.length === 0) {
      input.report.error('rien n’a été enregistré');
      return;
    }
    openEditor(null, steps);
  });

  // ── Import / export ─────────────────────────────────────────────────────

  elements.exportButton.addEventListener('click', () => {
    ioMode = 'export';
    elements.ioText.value = store.exportJson();
    elements.ioText.readOnly = true;
    elements.ioConfirm.hidden = true;
    elements.ioCopy.hidden = false;
    elements.ioStatus.textContent = 'Copiez ce texte pour le conserver ou le partager.';
    showPane('io');
  });
  elements.importButton.addEventListener('click', () => {
    ioMode = 'import';
    elements.ioText.value = '';
    elements.ioText.readOnly = false;
    elements.ioConfirm.hidden = false;
    elements.ioCopy.hidden = true;
    elements.ioStatus.textContent = 'Collez ici un export de commandes personnalisées. Rien ne remplace une commande existante.';
    showPane('io');
    elements.ioText.focus();
  });
  elements.ioCopy.addEventListener('click', async () => {
    try {
      await navigatorRef.clipboard.writeText(elements.ioText.value);
      elements.ioStatus.textContent = 'Copié dans le presse-papiers.';
    } catch {
      elements.ioText.select();
      elements.ioStatus.textContent = 'Sélectionné : copiez avec Ctrl+C.';
    }
  });
  elements.ioConfirm.addEventListener('click', () => {
    if (ioMode !== 'import') return;
    const result = parseCustomCommands(elements.ioText.value, { knownIds: knownIds(), taken: takenShortcuts(null), existing: store.list() });
    if (!result.ok) {
      elements.ioStatus.textContent = `Import impossible : ${result.error}.`;
      return;
    }
    for (const command of result.commands) store.save(command);
    syncRegistry();
    const refused = result.rejected.map(({ name, errors }) => `« ${name} » refusée : ${errors.join(' ; ')}`);
    elements.ioStatus.textContent = `${result.commands.length} commande(s) importée(s).${refused.length > 0 ? ` ${refused.join(' | ')}` : ''}`;
    if (result.commands.length > 0 && refused.length === 0) { showPane('list'); renderList(); }
    else renderList();
  });
  elements.ioCancel.addEventListener('click', () => { showPane('list'); renderList(); });

  // ── Fenêtre ─────────────────────────────────────────────────────────────

  function openDialog() {
    if (typeof elements.dialog.showModal === 'function') elements.dialog.showModal();
    else elements.dialog.setAttribute('open', '');
  }
  elements.close.addEventListener('click', () => elements.dialog.close());

  syncRegistry();
  renderList();
  renderBar();

  return {
    /** Ouvre le gestionnaire. */
    open() {
      capturing = false;
      showPane('list');
      renderList();
      openDialog();
    },
    /** Ouvre l'éditeur sur une commande vide. */
    create() { openEditor(null); },
    /** Démarre l'enregistrement d'une macro. */
    startRecording() { recorder.start(); },
    isRecording: () => recorder.isRecording(),
    /** Les commandes ont changé (autre fenêtre) : le registre suit, la liste aussi si elle est affichée. */
    reload() {
      syncRegistry();
      if (pane === 'list') renderList();
    },
    /** Les raccourcis existants, pour l'aide. */
    checkShortcut: (/** @type {string} */ shortcut) => checkShortcut(shortcut, { taken: takenShortcuts(null) }),
  };
}
