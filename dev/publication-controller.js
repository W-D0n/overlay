// @ts-check
/**
 * dev/publication-controller.js — Autour de « Publier » : le récapitulatif des changements, la bascule avant / après et le test
 * de la transition d'arrivée.
 *
 * Rien ici ne publie sans que l'utilisateur le demande : le récapitulatif est consultatif (un bouton, jamais une étape
 * obligatoire), l'avant / après remplace seulement l'aperçu par l'antenne le temps de la comparaison, et le test rejoue la
 * transition dans l'aperçu sans toucher à l'antenne.
 */
import { diffScenes, summarize } from './scene-diff.js';
import { sceneEffectsLabel } from './scene-labels.js';

/**
 * @param {{
 *   elements: {
 *     changes: HTMLButtonElement,
 *     compare: HTMLButtonElement,
 *     test: HTMLButtonElement,
 *     dialog: HTMLDialogElement,
 *     summary: HTMLElement,
 *     list: HTMLElement,
 *     send: HTMLButtonElement,
 *     close: HTMLButtonElement,
 *   },
 *   studio: ReturnType<typeof import('./studio-document.js').createStudioDocument>,
 *   preview: { publish(): Promise<boolean>, discard(): void, setCompare(on: boolean): void, isComparing(): boolean, testArrival(): void },
 *   labelOf: (kind: string) => string,
 *   optionLabel: (kind: string, key: string) => string,
 *   documentRef?: Document,
 * }} input
 */
export function createPublicationController(input) {
  const documentRef = input.documentRef ?? document;
  const { elements, studio, preview } = input;

  function changes() {
    const { onAir, scene } = studio.state();
    return diffScenes(onAir, scene, { labelOf: input.labelOf, optionLabel: input.optionLabel });
  }

  function render() {
    const { isDraft } = studio.state();
    const list = isDraft ? changes() : [];
    elements.changes.hidden = !isDraft;
    elements.compare.hidden = !isDraft;
    elements.changes.textContent = summarize(list);
    elements.changes.disabled = list.length === 0;
    if (!isDraft && preview.isComparing()) preview.setCompare(false);
    elements.compare.setAttribute('aria-pressed', String(preview.isComparing()));
  }

  function renderDialog() {
    const list = changes();
    elements.summary.textContent = `${summarize(list)} — ${sceneEffectsLabel(studio.state().onAir, input.labelOf)} (antenne) → ${sceneEffectsLabel(studio.state().scene, input.labelOf)} (brouillon)`;
    elements.list.replaceChildren();
    const verbs = { added: 'Ajoutée', removed: 'Retirée', changed: 'Modifiée', order: 'Ordre' };
    for (const change of list) {
      const item = documentRef.createElement('li');
      item.className = `change-row change-${change.kind}`;
      const head = documentRef.createElement('div');
      head.className = 'change-head';
      const badge = documentRef.createElement('span');
      badge.className = 'change-badge';
      badge.textContent = verbs[change.kind];
      const title = documentRef.createElement('strong');
      title.textContent = change.title;
      head.append(badge, title);
      item.appendChild(head);
      for (const detail of change.details) {
        const line = documentRef.createElement('div');
        line.className = 'change-detail';
        line.textContent = detail;
        item.appendChild(line);
      }
      elements.list.appendChild(item);
    }
    if (list.length === 0) {
      const empty = documentRef.createElement('li');
      empty.className = 'change-empty';
      empty.textContent = 'Le brouillon montre ce qui est à l’antenne.';
      elements.list.appendChild(empty);
    }
    elements.send.disabled = !studio.state().isDraft;
  }

  function showChanges() {
    if (!studio.state().isDraft) return;
    renderDialog();
    if (typeof elements.dialog.showModal === 'function') elements.dialog.showModal();
    else elements.dialog.setAttribute('open', '');
  }

  function toggleCompare() {
    if (!studio.state().isDraft) return;
    preview.setCompare(!preview.isComparing());
    render();
  }

  elements.changes.addEventListener('click', showChanges);
  elements.compare.addEventListener('click', toggleCompare);
  elements.test.addEventListener('click', () => preview.testArrival());
  elements.close.addEventListener('click', () => elements.dialog.close());
  elements.send.addEventListener('click', async () => {
    elements.dialog.close();
    await preview.publish();
  });

  const unsubscribe = studio.subscribe(render);
  render();

  return {
    showChanges,
    toggleCompare,
    testTransition: () => preview.testArrival(),
    publish: () => { preview.publish(); },
    discard: () => preview.discard(),
    destroy: unsubscribe,
  };
}
