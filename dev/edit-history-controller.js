// @ts-check
/**
 * dev/edit-history-controller.js — La fenêtre « Historique d'édition » : toutes les étapes de travail de la scène en cours,
 * ce que chacune a changé, depuis quand, et un retour à n'importe laquelle en un clic (annulable : rien n'est perdu tant
 * qu'on ne modifie pas autre chose). « Comparer » dit ce qu'un retour à cette étape ferait par rapport à l'état actuel.
 */
import { compareWithCurrent, describeHistory } from './edit-history.js';
import { setIcon } from './icons.js';

/**
 * @param {{
 *   elements: { dialog: HTMLDialogElement, list: HTMLElement, summary: HTMLElement, close: HTMLButtonElement, open?: HTMLButtonElement },
 *   editor: import('./scene-editor.js').SceneEditor,
 *   labelOf: (kind: string) => string,
 *   optionLabel: (kind: string, key: string) => string,
 *   now?: () => number,
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   documentRef?: Document,
 * }} input
 */
export function createEditHistoryController(input) {
  const documentRef = input.documentRef ?? document;
  const { elements, editor } = input;
  const now = input.now ?? Date.now;
  const labels = { labelOf: input.labelOf, optionLabel: input.optionLabel };
  /** La ligne dont le détail est ouvert. @type {number | null} */
  let expanded = null;

  const isOpen = () => elements.dialog.open;

  function render() {
    const history = editor.history();
    const rows = describeHistory(history, now(), labels);
    const steps = history.entries.length;
    elements.summary.textContent = steps === 0 ? 'Aucune modification' : `${steps} étape${steps > 1 ? 's' : ''}${history.position < steps ? ` — ${steps - history.position} défaite${steps - history.position > 1 ? 's' : ''}` : ''}`;
    elements.list.replaceChildren(...rows.map((row) => {
      const item = documentRef.createElement('li');
      item.className = 'edit-row';
      item.dataset.position = String(row.position);
      item.dataset.state = row.state;
      const head = documentRef.createElement('div');
      head.className = 'edit-row-head';
      const title = documentRef.createElement('strong');
      title.textContent = row.label;
      const age = documentRef.createElement('span');
      age.className = 'edit-row-age';
      age.textContent = row.state === 'current' ? `${row.age} — état actuel`.replace(/^ — /, '') : row.age;
      const summary = documentRef.createElement('span');
      summary.className = 'edit-row-summary';
      summary.textContent = row.summary;
      const actions = documentRef.createElement('span');
      actions.className = 'edit-row-actions';
      const compare = documentRef.createElement('button');
      compare.type = 'button';
      compare.dataset.action = 'compare';
      compare.textContent = expanded === row.position ? 'Masquer' : 'Comparer';
      compare.setAttribute('aria-expanded', String(expanded === row.position));
      compare.addEventListener('click', () => {
        expanded = expanded === row.position ? null : row.position;
        render();
      });
      const jump = documentRef.createElement('button');
      jump.type = 'button';
      jump.dataset.action = 'jump';
      jump.textContent = 'Revenir ici';
      jump.disabled = row.state === 'current';
      jump.addEventListener('click', () => {
        const result = editor.goTo(row.position);
        if (result.ok) input.report.ok(`retour à « ${row.label} »`);
        else input.report.error(result.message);
      });
      actions.append(compare, jump);
      head.append(title, age, actions);
      item.append(head, summary);
      if (expanded === row.position) {
        const detail = documentRef.createElement('div');
        detail.className = 'edit-row-detail';
        const own = documentRef.createElement('ul');
        own.className = 'edit-row-changes';
        for (const text of row.details) {
          const line = documentRef.createElement('li');
          line.textContent = text;
          own.appendChild(line);
        }
        const versus = compareWithCurrent(history, row.position, editor.state().scene, labels);
        const heading = documentRef.createElement('p');
        heading.className = 'edit-row-versus';
        heading.textContent = row.state === 'current'
          ? 'C’est l’état actuel.'
          : versus.length === 0 ? 'Identique à l’état actuel pour ce qui se voit à l’antenne.' : `Revenir ici changerait ${versus.length} chose${versus.length > 1 ? 's' : ''} par rapport à maintenant :`;
        const changes = documentRef.createElement('ul');
        changes.className = 'edit-row-changes';
        for (const change of versus) {
          const line = documentRef.createElement('li');
          line.textContent = change.details.length > 0 ? `${change.title} — ${change.details.join(' ; ')}` : `${change.title} — ${{ added: 'serait ajoutée', removed: 'serait retirée', order: 'ordre modifié', changed: 'modifiée' }[change.kind]}`;
          changes.appendChild(line);
        }
        if (row.details.length > 0) detail.append(own);
        detail.append(heading, changes);
        item.appendChild(detail);
      }
      return item;
    }));
  }

  const unsubscribe = editor.subscribe(() => { if (isOpen()) render(); });
  elements.close.addEventListener('click', () => elements.dialog.close());

  function open() {
    expanded = null;
    render();
    if (typeof elements.dialog.showModal === 'function') elements.dialog.showModal();
    else elements.dialog.setAttribute('open', '');
  }
  if (elements.open !== undefined) {
    setIcon(elements.open, 'history');
    elements.open.addEventListener('click', open);
  }

  return {
    open,
    render,
    destroy: unsubscribe,
  };
}
