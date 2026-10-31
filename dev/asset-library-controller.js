// @ts-check
import { errorMessage } from './error-message.js';
import { describeAsset, pickImageFiles, summarizeImport } from './asset-library-view.js';

/**
 * dev/asset-library-controller.js — La médiathèque du Studio : les images importées, leur import (bouton ou glisser-déposer), leur
 * suppression, et le choix d'une image pour une couche.
 *
 * La fenêtre s'ouvre pour consulter, ou pour **choisir** : `open({ choose })` montre un bouton « Utiliser » sur chaque image et
 * appelle `choose` avec celle qu'on retient. `importFiles` sert aussi à déposer des fichiers directement sur l'aperçu : elle rend les
 * assets obtenus (nouveaux ou déjà présents), dans l'ordre des fichiers. La liste est relue du serveur à chaque ouverture et
 * après chaque changement ; les abonnés (le formulaire d'une couche image) la reçoivent à jour. Une suppression demande une
 * seconde pression sur le bouton, et elle est refusée tant que l'image est utilisée : par une scène du serveur (le serveur le
 * refuse) ou par la scène en cours d'édition, que le serveur ne connaît pas encore (`usedHere`).
 *
 *
 * @typedef {import('./asset-client.js').LibraryAsset} LibraryAsset
 */

const CONFIRM_MS = 4000;

/**
 * @param {{
 *   elements: {
 *     dialog: HTMLDialogElement, grid: HTMLElement, status: HTMLElement, importButton: HTMLButtonElement,
 *     fileInput: HTMLInputElement, close: HTMLButtonElement, hint: HTMLElement,
 *   },
 *   client: ReturnType<typeof import('./asset-client.js').createAssetClient>,
 *   urlOf: (id: string) => string,
 *   usedHere?: () => Map<string, number>,
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   documentRef?: Document,
 *   setTimeoutImpl?: typeof setTimeout,
 *   clearTimeoutImpl?: typeof clearTimeout,
 * }} input
 */
export function createAssetLibraryController(input) {
  const documentRef = input.documentRef ?? document;
  const setTimeoutImpl = input.setTimeoutImpl ?? setTimeout;
  const clearTimeoutImpl = input.clearTimeoutImpl ?? clearTimeout;
  const { elements, client } = input;
  /** @type {LibraryAsset[]} */
  let assets = [];
  /** @type {((asset: LibraryAsset) => void) | null} */
  let chooser = null;
  /** @type {string | null} */
  let confirming = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let confirmTimer = null;
  /** @type {Set<(assets: LibraryAsset[]) => void>} */
  const listeners = new Set();

  /** @param {string} message @param {boolean} [isError] */
  function say(message, isError = false) {
    elements.status.textContent = message;
    elements.status.dataset.level = isError ? 'error' : 'info';
  }

  function resetConfirm() {
    confirming = null;
    if (confirmTimer !== null) clearTimeoutImpl(confirmTimer);
    confirmTimer = null;
  }

  /** @param {string} tag @param {string} [className] @param {string} [text] */
  function node(tag, className, text) {
    const el = documentRef.createElement(tag);
    if (className !== undefined) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function render() {
    elements.grid.replaceChildren();
    elements.hint.hidden = assets.length > 0;
    for (const asset of assets) {
      const card = node('article', 'asset-card');
      card.dataset.id = asset.id;
      const thumb = /** @type {HTMLImageElement} */ (node('img', 'asset-thumb'));
      thumb.src = input.urlOf(asset.id);
      thumb.alt = '';
      thumb.loading = 'lazy';
      thumb.crossOrigin = 'anonymous';
      const name = node('div', 'asset-name', asset.name);
      name.title = asset.name;
      const here = input.usedHere?.().get(asset.id) ?? 0;
      const info = node('div', 'asset-info', describeAsset({ ...asset, uses: Math.max(asset.uses, here) }));
      const actions = node('div', 'asset-actions');
      if (chooser !== null) {
        const use = /** @type {HTMLButtonElement} */ (node('button', 'asset-use', 'Utiliser'));
        use.type = 'button';
        use.setAttribute('aria-label', `Utiliser ${asset.name}`);
        use.addEventListener('click', () => {
          const choose = chooser;
          close();
          choose?.(asset);
        });
        actions.appendChild(use);
      }
      const remove = /** @type {HTMLButtonElement} */ (node('button', 'asset-remove', confirming === asset.id ? 'Confirmer ?' : 'Supprimer'));
      remove.type = 'button';
      remove.setAttribute('aria-label', `${confirming === asset.id ? 'Confirmer la suppression de' : 'Supprimer'} ${asset.name}`);
      remove.addEventListener('click', () => { void removeAsset(asset); });
      actions.appendChild(remove);
      card.append(thumb, name, info, actions);
      elements.grid.appendChild(card);
    }
  }

  async function refresh() {
    try {
      assets = await client.list();
    } catch (error) {
      say(`Médiathèque indisponible : ${errorMessage(error)}`, true);
      return assets;
    }
    render();
    for (const listener of listeners) listener([...assets]);
    return assets;
  }

  /** @param {LibraryAsset} asset */
  async function removeAsset(asset) {
    if (confirming !== asset.id) {
      resetConfirm();
      confirming = asset.id;
      confirmTimer = setTimeoutImpl(() => { resetConfirm(); render(); }, CONFIRM_MS);
      render();
      return;
    }
    resetConfirm();
    if ((input.usedHere?.().get(asset.id) ?? 0) > 0) {
      say(`« ${asset.name} » est utilisée par la scène en cours : retirez-la de ses couches d’abord.`, true);
      render();
      return;
    }
    try {
      await client.remove(asset.id);
      say(`« ${asset.name} » supprimée.`);
    } catch (error) {
      say(errorMessage(error), true);
    }
    await refresh();
  }

  /**
   * Envoie des fichiers à la médiathèque.
   * @param {readonly (Blob & { name: string, type: string })[]} files
   * @returns {Promise<import('./asset-format.js').AssetMeta[]>} les assets obtenus, nouveaux ou déjà présents, dans l'ordre des fichiers
   */
  async function importFiles(files) {
    const { images, ignored } = pickImageFiles(files);
    /** @type {import('./asset-format.js').AssetMeta[]} */
    const obtained = [];
    let added = 0;
    let known = 0;
    /** @type {string[]} */
    const failed = [];
    for (const file of images) {
      try {
        const result = await client.upload(file);
        obtained.push(result.asset);
        if (result.created) added += 1; else known += 1;
      } catch (error) {
        failed.push(`${file.name} : ${errorMessage(error)}`);
      }
    }
    const message = summarizeImport({ added, known, failed, ignored });
    say(message, failed.length > 0 || (obtained.length === 0 && files.length > 0));
    if (failed.length > 0) input.report.error(message);
    await refresh();
    return obtained;
  }

  function close() {
    resetConfirm();
    chooser = null;
    if (elements.dialog.open) elements.dialog.close();
  }

  elements.importButton.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', () => {
    const files = [...(elements.fileInput.files ?? [])];
    elements.fileInput.value = '';
    if (files.length > 0) void importFiles(files);
  });
  elements.close.addEventListener('click', close);
  elements.dialog.addEventListener('close', () => { resetConfirm(); chooser = null; });
  elements.dialog.addEventListener('dragover', (event) => { event.preventDefault(); });
  elements.dialog.addEventListener('drop', (event) => {
    event.preventDefault();
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length > 0) void importFiles(files);
  });

  return {
    /** @param {{ choose?: (asset: LibraryAsset) => void }} [options] */
    async open({ choose } = {}) {
      chooser = choose ?? null;
      say(choose === undefined ? '' : 'Choisissez une image, ou importez-en une.');
      render();
      if (typeof elements.dialog.showModal === 'function') elements.dialog.showModal();
      else elements.dialog.setAttribute('open', '');
      await refresh();
    },
    close,
    refresh,
    importFiles,
    /** @returns {LibraryAsset[]} */
    assets: () => [...assets],
    /** @param {(assets: LibraryAsset[]) => void} listener @returns {() => void} */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
