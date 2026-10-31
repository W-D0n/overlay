// @ts-check
import { errorMessage } from './error-message.js';
import { describeRestoration, describeVersion, formatVersionDate } from './version-view.js';

/**
 * dev/versions-controller.js — La fenêtre des versions nommées de la scène en cours d'édition.
 *
 * « Enregistrer » garde la scène **telle qu'elle est dans le brouillon** (réglages non publiés compris) sous un nom. « Restaurer » en remet
 * les couches et la transition dans le brouillon, en **une** entrée d'historique : un Ctrl+Z revient à ce qu'on avait avant, et rien n'est
 * publié tant qu'on ne le décide pas. Le nom de la scène, son identité et ses étiquettes ne changent pas. Une suppression demande une
 * seconde pression ; un renommage se fait sur place. Les erreurs du serveur (nom déjà pris, 30 versions déjà gardées) sont dites telles quelles.
 *
 * @param {{
 *   elements: { dialog: HTMLDialogElement, title: HTMLElement, name: HTMLInputElement, save: HTMLButtonElement, list: HTMLElement, status: HTMLElement, close: HTMLButtonElement },
 *   studio: ReturnType<typeof import('./studio-document.js').createStudioDocument>,
 *   client: ReturnType<typeof import('./version-client.js').createVersionClient>,
 *   labelOf: (kind: string) => string,
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   documentRef?: Document,
 *   setTimeoutImpl?: typeof setTimeout,
 *   clearTimeoutImpl?: typeof clearTimeout,
 * }} input
 */
export function createVersionsController(input) {
  const documentRef = input.documentRef ?? document;
  const setTimeoutImpl = input.setTimeoutImpl ?? setTimeout;
  const clearTimeoutImpl = input.clearTimeoutImpl ?? clearTimeout;
  const { elements, studio, client } = input;
  /** @type {import('./version-store.js').StoredVersion[]} */
  let versions = [];
  /** @type {{ id: string, mode: 'remove' | 'rename' } | null} */
  let editing = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;

  /** @param {string} message @param {boolean} [isError] */
  function say(message, isError = false) {
    elements.status.textContent = message;
    elements.status.dataset.level = isError ? 'error' : 'info';
  }

  function resetEditing() {
    editing = null;
    if (timer !== null) clearTimeoutImpl(timer);
    timer = null;
  }

  /** @param {{ id: string, mode: 'remove' | 'rename' }} next */
  function startEditing(next) {
    resetEditing();
    editing = next;
    if (next.mode === 'remove') timer = setTimeoutImpl(() => { resetEditing(); render(); }, 4000);
    render();
  }

  /** @param {string} tag @param {string} [className] @param {string} [text] */
  function node(tag, className, text) {
    const el = documentRef.createElement(tag);
    if (className !== undefined) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  /** @param {string} label @param {string} action @param {() => void} onClick */
  function button(label, action, onClick) {
    const el = /** @type {HTMLButtonElement} */ (node('button', undefined, label));
    el.type = 'button';
    el.dataset.action = action;
    el.addEventListener('click', onClick);
    return el;
  }

  function render() {
    const scene = studio.state().scene;
    elements.title.textContent = `Versions de « ${scene.name} »`;
    elements.list.replaceChildren();
    if (versions.length === 0) {
      elements.list.appendChild(node('li', 'version-empty', 'Aucune version : donnez un nom à l’état actuel de la scène pour pouvoir y revenir.'));
      return;
    }
    for (const version of versions) {
      const item = node('li', 'version-item');
      item.dataset.id = version.id;
      const head = node('div', 'version-head');
      if (editing?.id === version.id && editing.mode === 'rename') {
        const field = /** @type {HTMLInputElement} */ (node('input'));
        field.type = 'text';
        field.value = version.name;
        field.maxLength = 60;
        field.setAttribute('aria-label', `Nouveau nom de la version ${version.name}`);
        field.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') { event.preventDefault(); void rename(version, field.value); }
          if (event.key === 'Escape') { event.stopPropagation(); resetEditing(); render(); }
        });
        head.appendChild(field);
        queueMicrotask(() => field.select());
        item.append(head, button('Valider', 'rename-confirm', () => { void rename(version, field.value); }), button('Annuler', 'rename-cancel', () => { resetEditing(); render(); }));
        elements.list.appendChild(item);
        continue;
      }
      head.append(node('strong', 'version-name', version.name), node('span', 'version-date', formatVersionDate(version.at)));
      const summary = node('div', 'version-summary', `${describeVersion(version.scene, input.labelOf)} — ${describeRestoration(version.scene, scene)}`);
      const actions = node('div', 'version-actions');
      actions.append(
        button('Restaurer', 'restore', () => restore(version)),
        button('Renommer', 'rename', () => startEditing({ id: version.id, mode: 'rename' })),
        button(editing?.id === version.id && editing.mode === 'remove' ? 'Confirmer ?' : 'Supprimer', 'remove', () => { void remove(version); }),
      );
      item.append(head, summary, actions);
      elements.list.appendChild(item);
    }
  }

  async function refresh() {
    try {
      versions = await client.list(studio.state().scene.id);
    } catch (error) {
      say(`Versions indisponibles : ${errorMessage(error)}`, true);
      return;
    }
    render();
  }

  async function save() {
    const name = elements.name.value;
    try {
      const version = await client.add(structuredClone(studio.state().scene), name);
      elements.name.value = '';
      say(`Version « ${version.name} » enregistrée.`);
      input.report.ok(`version « ${version.name} » enregistrée`);
    } catch (error) {
      say(errorMessage(error), true);
      return;
    }
    await refresh();
  }

  /** @param {import('./version-store.js').StoredVersion} version */
  function restore(version) {
    const result = studio.editor.restoreVersion(version.scene, `Restaurer la version « ${version.name} »`);
    if (!result.ok) {
      say(result.message, true);
      return;
    }
    elements.dialog.close();
    input.report.ok(`version « ${version.name} » restaurée dans le brouillon — Ctrl+Z pour revenir`);
  }

  /** @param {import('./version-store.js').StoredVersion} version @param {string} name */
  async function rename(version, name) {
    try {
      await client.rename(version.id, name);
      say(`Version renommée en « ${name.trim()} ».`);
    } catch (error) {
      say(errorMessage(error), true);
      return;
    }
    resetEditing();
    await refresh();
  }

  /** @param {import('./version-store.js').StoredVersion} version */
  async function remove(version) {
    if (editing?.id !== version.id || editing.mode !== 'remove') {
      startEditing({ id: version.id, mode: 'remove' });
      return;
    }
    resetEditing();
    try {
      await client.remove(version.id);
      say(`Version « ${version.name} » supprimée.`);
    } catch (error) {
      say(errorMessage(error), true);
    }
    await refresh();
  }

  elements.save.addEventListener('click', () => { void save(); });
  elements.name.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); void save(); }
  });
  elements.close.addEventListener('click', () => elements.dialog.close());
  elements.dialog.addEventListener('close', resetEditing);

  return {
    async open() {
      resetEditing();
      say('');
      render();
      if (typeof elements.dialog.showModal === 'function') elements.dialog.showModal();
      else elements.dialog.setAttribute('open', '');
      await refresh();
    },
    /** Ouvre la fenêtre sur le champ du nom, prête à enregistrer. */
    async save() {
      await this.open();
      elements.name.focus();
    },
  };
}
