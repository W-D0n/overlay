// @ts-check
/**
 * dev/templates-controller.js — La fenêtre « Modèles de couches » : enregistrer la sélection sous un nom, puis insérer,
 * renommer ou supprimer un modèle. Les modèles vivent dans les réglages du Studio (serveur) : ils suivent l'utilisateur
 * d'une scène à l'autre et d'un navigateur à l'application de bureau.
 */
import { layersToCopy } from '../src/layers/layer-group.js';
import { isIdentityKind } from '../src/layers/layer-kinds.js';
import { libraryByCategory, searchLibrary } from './builtin-layer-templates.js';
import { createTemplate, describeTemplate, templateNameError } from './layer-templates.js';

/**
 * @param {{
 *   elements: {
 *     dialog: HTMLDialogElement, name: HTMLInputElement, save: HTMLButtonElement, error: HTMLElement,
 *     list: HTMLElement, empty: HTMLElement, close: HTMLButtonElement, search: HTMLInputElement, library: HTMLElement, libraryEmpty: HTMLElement,
 *   },
 *   settings: {
 *     getTemplates(): import('./studio-settings.js').StoredTemplate[],
 *     setTemplates(templates: import('./studio-settings.js').StoredTemplate[]): void,
 *     subscribe(listener: () => void): () => void,
 *   },
 *   editor: import('./scene-editor.js').SceneEditor,
 *   labelOf: (kind: string) => string,
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   documentRef?: Document,
 * }} input
 */
export function createTemplatesController(input) {
  const documentRef = input.documentRef ?? document;
  const { elements, settings, editor } = input;
  /** Le modèle en cours de renommage, ou en attente de confirmation de suppression. @type {{ id: string, mode: 'rename' | 'remove' } | null} */
  let editing = null;

  const selectedLayers = () => {
    const { scene, selection } = editor.state();
    // A group goes with its members; a member whose group is not selected becomes a free layer, so the template is a valid scene.
    return layersToCopy(scene.layers, selection);
  };

  function renderSave() {
    const templates = settings.getTemplates();
    const layers = selectedLayers();
    const typed = elements.name.value;
    const problem = layers.length === 0 ? 'sélectionnez au moins une couche pour en faire un modèle' : typed.trim() === '' ? null : templateNameError(typed, templates);
    const drawn = layers.filter((layer) => layer.kind !== 'group').length;
    elements.error.textContent = problem ?? '';
    elements.save.disabled = layers.length === 0 || typed.trim() === '' || problem !== null;
    elements.save.title = layers.length === 0 ? 'Sélectionnez au moins une couche' : `Enregistrer ${drawn} couche${drawn > 1 ? 's' : ''} comme modèle`;
  }

  /** @param {string} label @param {string} action */
  function button(label, action) {
    const el = documentRef.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.dataset.action = action;
    return el;
  }

  /**
   * Inserts a template in the scene, one history step. An identity layer (branding) is unique in the scene: if it is already there, the template goes in without it.
   * @param {string} name @param {readonly import('../src/scene/scene-doc.js').Layer[]} templateLayers
   */
  function insertTemplate(name, templateLayers) {
    const present = new Set(editor.state().scene.layers.map((layer) => layer.kind));
    const layers = templateLayers.filter((layer) => !(isIdentityKind(layer.kind) && present.has(layer.kind)));
    const skipped = templateLayers.length - layers.length;
    const result = editor.insertLayers(layers, `Insérer le modèle « ${name} »`);
    if (result.ok) {
      elements.dialog.close();
      input.report.ok(`modèle « ${name} » inséré${skipped > 0 ? ` (${skipped} couche d’identité déjà présente, ignorée)` : ''}`);
    } else {
      input.report.error(`modèle « ${name} » : ${result.message}`);
    }
  }

  /** The library shipped with the Studio: searchable, by category; a template is inserted as is, or copied to the owner templates to be edited and renamed. */
  function renderLibrary() {
    const found = searchLibrary(elements.search.value);
    elements.libraryEmpty.hidden = found.length > 0;
    elements.library.replaceChildren(...libraryByCategory(found).flatMap(({ category, templates }) => {
      const heading = documentRef.createElement('li');
      heading.className = 'tpl-category';
      heading.setAttribute('role', 'presentation');
      heading.textContent = category;
      return [heading, ...templates.map((template) => {
        const item = documentRef.createElement('li');
        item.className = 'tpl-card';
        item.dataset.id = template.id;
        const title = documentRef.createElement('strong');
        title.textContent = template.name;
        const head = documentRef.createElement('div');
        head.className = 'tpl-head';
        head.appendChild(title);
        const summary = documentRef.createElement('div');
        summary.className = 'tpl-summary';
        summary.textContent = `${template.description} (${describeTemplate(template, input.labelOf)})`;
        const actions = documentRef.createElement('span');
        actions.className = 'tpl-actions';
        const insert = button('Insérer', 'insert');
        insert.addEventListener('click', () => insertTemplate(template.name, template.layers));
        const copy = button('Copier dans mes modèles', 'copy');
        copy.addEventListener('click', () => {
          const mine = settings.getTemplates();
          let name = template.name;
          for (let n = 2; templateNameError(name, mine) !== null && n < 100; n += 1) name = `${template.name} (${n})`;
          const result = createTemplate(name, template.layers, mine);
          if (!result.ok) {
            input.report.error(result.error);
            return;
          }
          settings.setTemplates([...mine, result.template]);
          input.report.ok(`« ${result.template.name} » copié dans vos modèles`);
          render();
        });
        actions.append(insert, copy);
        item.append(head, summary, actions);
        return item;
      })];
    }));
  }

  function renderList() {
    const templates = settings.getTemplates();
    elements.empty.hidden = templates.length > 0;
    elements.list.replaceChildren(...templates.map((template) => {
      const item = documentRef.createElement('li');
      item.className = 'tpl-card';
      item.dataset.id = template.id;
      const head = documentRef.createElement('div');
      head.className = 'tpl-head';
      const actions = documentRef.createElement('span');
      actions.className = 'tpl-actions';

      if (editing?.id === template.id && editing.mode === 'rename') {
        const field = documentRef.createElement('input');
        field.type = 'text';
        field.value = template.name;
        field.setAttribute('aria-label', `Nouveau nom de « ${template.name} »`);
        const problem = documentRef.createElement('span');
        problem.className = 'tpl-error';
        const confirm = button('Renommer', 'rename-confirm');
        const refresh = () => {
          const message = templateNameError(field.value, templates, template.id);
          problem.textContent = message ?? '';
          confirm.disabled = message !== null;
        };
        const commit = () => {
          if (templateNameError(field.value, templates, template.id) !== null) return;
          settings.setTemplates(templates.map((other) => (other.id === template.id ? { ...other, name: field.value.trim() } : other)));
          editing = null;
          renderList();
        };
        field.addEventListener('input', refresh);
        field.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') { event.preventDefault(); commit(); }
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); editing = null; renderList(); }
        });
        confirm.addEventListener('click', commit);
        const cancel = button('Annuler', 'rename-cancel');
        cancel.addEventListener('click', () => { editing = null; renderList(); });
        refresh();
        head.append(field, problem);
        actions.append(confirm, cancel);
        item.append(head, actions);
        queueMicrotask(() => field.select());
        return item;
      }

      const title = documentRef.createElement('strong');
      title.textContent = template.name;
      head.appendChild(title);
      const summary = documentRef.createElement('div');
      summary.className = 'tpl-summary';
      summary.textContent = describeTemplate(template, input.labelOf);

      if (editing?.id === template.id && editing.mode === 'remove') {
        const ask = documentRef.createElement('span');
        ask.textContent = `Supprimer « ${template.name} » ?`;
        const yes = button('Oui', 'remove-confirm');
        yes.addEventListener('click', () => {
          settings.setTemplates(templates.filter((other) => other.id !== template.id));
          editing = null;
          renderList();
        });
        const no = button('Non', 'remove-cancel');
        no.addEventListener('click', () => { editing = null; renderList(); });
        actions.append(ask, yes, no);
      } else {
        const insert = button('Insérer', 'insert');
        insert.addEventListener('click', () => insertTemplate(template.name, template.layers));
        const rename = button('Renommer', 'rename');
        rename.addEventListener('click', () => { editing = { id: template.id, mode: 'rename' }; renderList(); });
        const remove = button('Supprimer', 'remove');
        remove.addEventListener('click', () => { editing = { id: template.id, mode: 'remove' }; renderList(); });
        actions.append(insert, rename, remove);
      }
      item.append(head, summary, actions);
      return item;
    }));
  }

  function render() {
    renderSave();
    renderList();
    renderLibrary();
  }

  elements.search.addEventListener('input', renderLibrary);

  elements.name.addEventListener('input', renderSave);
  elements.name.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); elements.save.click(); }
  });
  elements.save.addEventListener('click', () => {
    const result = createTemplate(elements.name.value, selectedLayers(), settings.getTemplates());
    if (!result.ok) {
      input.report.error(result.error);
      return;
    }
    settings.setTemplates([...settings.getTemplates(), result.template]);
    elements.name.value = '';
    input.report.ok(`modèle « ${result.template.name} » enregistré`);
    render();
  });
  elements.close.addEventListener('click', () => elements.dialog.close());

  const stopSettings = settings.subscribe(() => { if (elements.dialog.open && editing === null) render(); });
  const stopEditor = editor.subscribe(() => { if (elements.dialog.open) renderSave(); });

  function open() {
    editing = null;
    render();
    if (typeof elements.dialog.showModal === 'function') elements.dialog.showModal();
    else elements.dialog.setAttribute('open', '');
  }

  return {
    open,
    /** Ouvre la fenêtre sur le champ du nom, prête à enregistrer la sélection. */
    save() {
      open();
      elements.name.focus();
    },
    destroy() {
      stopSettings();
      stopEditor();
    },
  };
}
