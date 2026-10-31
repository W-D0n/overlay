// @ts-check
import { backgroundEffectLabel } from './component-field-schemas.js';
import { historyRows } from './history-view.js';
import { errorMessage } from './error-message.js';

const CONFIRM_DELAY_MS = 4000;

/**
 * Panneau « Historique » du Studio : les états qui ont quitté l'antenne, et le geste pour en remettre un. Remettre à
 * l'antenne agit en direct : le premier clic demande confirmation sur le bouton lui-même, le second applique.
 * La présentation vient de `history-view.js` ; ce module peint le DOM.
 *
 * @param {{
 *   dialog: HTMLDialogElement,
 *   openButton: HTMLButtonElement,
 *   closeButton: HTMLButtonElement,
 *   summary: HTMLElement,
 *   list: HTMLElement,
 *   client: {
 *     readHistory(): Promise<{ at: string, scene: import('../scene-doc.js').SceneDoc }[]>,
 *     rollback(at: string): Promise<*>,
 *   },
 *   documentRef?: Document,
 *   windowRef?: Window,
 *   now?: () => number,
 * }} input
 */
export function createHistoryController(input) {
  const documentRef = input.documentRef ?? document;
  const windowRef = input.windowRef ?? window;
  const now = input.now ?? Date.now;
  const formatDate = (/** @type {Date} */ date) => date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  async function refresh() {
    /** @type {{ at: string, scene: import('../scene-doc.js').SceneDoc }[]} */
    let entries;
    try {
      entries = await input.client.readHistory();
    } catch {
      input.summary.textContent = 'Historique indisponible : serveur injoignable ou trop ancien (redémarrez-le).';
      input.list.replaceChildren();
      return;
    }
    input.summary.textContent = entries.length === 0
      ? 'Aucune publication remplacée pour l’instant.'
      : `${entries.length} état${entries.length > 1 ? 's' : ''} remplacé${entries.length > 1 ? 's' : ''}, le plus récent d’abord.`;
    const rows = historyRows(entries, { labelOf: backgroundEffectLabel, nowMs: now(), formatDate });
    input.list.replaceChildren(...rows.map(renderRow));
  }

  /** @param {import('./history-view.js').HistoryRow} row */
  function renderRow(row) {
    const item = documentRef.createElement('li');
    item.className = 'diagnostic-check history-row';
    const text = documentRef.createElement('div');
    const head = documentRef.createElement('div');
    head.className = 'diagnostic-head';
    const title = documentRef.createElement('strong');
    title.textContent = row.title;
    const when = documentRef.createElement('span');
    when.className = 'diagnostic-short';
    when.textContent = row.when;
    head.append(title, when);
    text.append(head);
    if (row.detail !== '') {
      const detail = documentRef.createElement('p');
      detail.textContent = row.detail;
      text.append(detail);
    }

    const button = documentRef.createElement('button');
    button.type = 'button';
    button.textContent = 'Remettre à l’antenne';
    button.setAttribute('aria-label', `Remettre à l’antenne : ${row.title}, ${row.when}`);
    /** @type {number | null} */
    let confirmTimer = null;
    const disarm = () => {
      if (confirmTimer !== null) windowRef.clearTimeout(confirmTimer);
      confirmTimer = null;
      button.textContent = 'Remettre à l’antenne';
      delete button.dataset.armed;
    };
    button.onclick = async () => {
      if (confirmTimer === null) {
        button.textContent = 'Confirmer : en direct';
        button.dataset.armed = 'true';
        confirmTimer = windowRef.setTimeout(disarm, CONFIRM_DELAY_MS);
        return;
      }
      disarm();
      button.disabled = true;
      try {
        await input.client.rollback(row.at);
        input.summary.textContent = `${row.title} est de retour à l’antenne.`;
      } catch (error) {
        input.summary.textContent = `Retour impossible : ${errorMessage(error)}`;
      }
      await refresh();
    };

    item.append(text, button);
    return item;
  }

  function open() {
    if (!input.dialog.open) input.dialog.showModal();
    return refresh();
  }

  input.openButton.onclick = () => { open(); };
  input.closeButton.onclick = () => input.dialog.close();

  return {
    refresh,
    open,
    destroy() {
      if (input.dialog.open) input.dialog.close();
    },
  };
}
