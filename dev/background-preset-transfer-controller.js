// @ts-check
import {
  createBackgroundPresetBundle,
  findImportedActivePreset,
  parseBackgroundPresetBundle,
} from './background-preset-library.js';
import {
  createBackgroundPresetImportReview,
  reduceBackgroundPresetImportReview,
} from './background-preset-import-flow.js';
import {
  formatBackgroundPresetImportChange,
  formatBackgroundPresetImportSummary,
} from './background-preset-presenter.js';

/**
 * Parcours autonome d’export et d’import confirmé de la bibliothèque de presets.
 *
 * @param {{
 *   elements: {
 *     exportButton: HTMLButtonElement,
 *     importTrigger: HTMLButtonElement,
 *     importInput: HTMLInputElement,
 *     importReview: HTMLElement,
 *     importSummary: HTMLElement,
 *     importDetails: HTMLElement,
 *     importConfirm: HTMLButtonElement,
 *     importCancel: HTMLButtonElement,
 *     presetName: HTMLInputElement,
 *   },
 *   client: ReturnType<typeof import('./background-state-client.js').createBackgroundStateClient>,
 *   preview: ReturnType<typeof import('./background-preview-controller.js').createBackgroundPreviewController>,
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   getPresets: () => Array<Record<string, any>>,
 *   refreshPresets: () => Promise<Array<Record<string, any>> | null>,
 *   documentRef?: Document,
 *   windowRef?: Window,
 *   urlApi?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>,
 *   BlobImpl?: typeof Blob,
 * }} input
 */
export function createBackgroundPresetTransferController(input) {
  const documentRef = input.documentRef ?? document;
  const windowRef = input.windowRef ?? window;
  const urlApi = input.urlApi ?? URL;
  const BlobImpl = input.BlobImpl ?? Blob;
  const elements = input.elements;
  let reviewState = createBackgroundPresetImportReview();

  /** @param {import('./background-preset-library.js').BackgroundPresetImportChange[]} changes */
  function renderImportDetails(changes) {
    const cards = changes.map((change) => {
      const view = formatBackgroundPresetImportChange(change);
      const card = documentRef.createElement('article');
      card.className = 'preset-import-change';

      const heading = documentRef.createElement('div');
      heading.className = 'preset-import-change-heading';
      const operation = documentRef.createElement('span');
      operation.className = `preset-import-operation preset-import-operation--${change.operation}`;
      operation.textContent = view.operationLabel;
      const title = documentRef.createElement('strong');
      title.textContent = view.title;
      heading.append(operation, title);
      card.append(heading);

      if (view.note !== '') {
        const note = documentRef.createElement('p');
        note.className = 'preset-import-change-note';
        note.textContent = view.note;
        card.append(note);
      }
      if (view.details.length > 0) {
        const list = documentRef.createElement('ul');
        for (const detail of view.details) {
          const item = documentRef.createElement('li');
          item.textContent = detail;
          list.append(item);
        }
        card.append(list);
      }
      return card;
    });
    elements.importDetails.replaceChildren(...cards);
  }

  function renderReview() {
    const pending = reviewState.pending;
    elements.importReview.hidden = pending === null;
    elements.importSummary.textContent = pending === null
      ? ''
      : `Vérifier l'import : ${formatBackgroundPresetImportSummary(pending.plan)}`;
    renderImportDetails(pending?.plan.changes ?? []);
    elements.importConfirm.disabled = reviewState.importing;
    elements.importCancel.disabled = reviewState.importing;
    elements.importTrigger.disabled = reviewState.importing;
  }

  function transition(event) {
    const result = reduceBackgroundPresetImportReview(reviewState, event);
    reviewState = result.state;
    renderReview();
    return result.command;
  }

  function clearPendingImport() {
    transition({ type: 'cancelled' });
    elements.importInput.value = '';
  }

  async function requestPreview(content, parsed) {
    try {
      const preview = await input.client.previewPresetImport(content);
      return {
        content,
        parsed,
        revision: preview.revision,
        plan: {
          created: preview.created,
          updated: preview.updated,
          renamed: preview.renamed,
          unchanged: preview.unchanged,
          changes: preview.changes,
        },
      };
    } catch (error) {
      input.report.error(`aperçu d’import impossible : ${error.message}`);
      return null;
    }
  }

  async function confirmImport() {
    const command = transition({ type: 'confirmed' });
    if (command === null) return;
    const { pending } = command;
    try {
      await input.client.importPresets(pending.content, pending.revision);
      const summary = formatBackgroundPresetImportSummary(pending.plan);
      transition({ type: 'completed' });
      elements.importInput.value = '';
      const presets = await input.refreshPresets();
      if (presets === null) {
        input.report.error(`import appliqué (${summary}), mais relecture impossible — rafraîchir le tuner`);
        return;
      }
      const activePresetId = input.preview.snapshot().activePresetId;
      const refreshedActivePreset = findImportedActivePreset(
        presets,
        pending.parsed.presets,
        activePresetId,
      );
      let activePresetSynced = true;
      if (refreshedActivePreset !== null) {
        input.preview.apply(refreshedActivePreset, refreshedActivePreset.id);
        elements.presetName.value = refreshedActivePreset.name;
        activePresetSynced = await input.preview.persistNow();
      }
      if (activePresetSynced) input.report.ok(`import terminé · ${summary}`);
    } catch (error) {
      transition({ type: 'failed' });
      if (error.status === 409) {
        const refreshed = await requestPreview(pending.content, pending.parsed);
        if (refreshed === null) {
          transition({ type: 'cancelled' });
          return;
        }
        transition({ type: 'selected', pending: refreshed });
        input.report.error('bibliothèque modifiée — résumé actualisé, confirmer à nouveau');
        return;
      }
      input.report.error(`import-presets : ${error.message}`);
    }
  }

  function initialize() {
    elements.exportButton.onclick = () => {
      const presets = input.getPresets();
      const content = `${JSON.stringify(createBackgroundPresetBundle(presets), null, 2)}\n`;
      const url = urlApi.createObjectURL(new BlobImpl([content], { type: 'application/json' }));
      const link = documentRef.createElement('a');
      link.href = url;
      link.download = 'overlay-background-presets.json';
      link.click();
      windowRef.setTimeout(() => urlApi.revokeObjectURL(url), 0);
      input.report.ok(`${presets.length} preset(s) exporté(s)`);
    };

    elements.importTrigger.onclick = () => elements.importInput.click();
    elements.importInput.onchange = async () => {
      const file = elements.importInput.files?.[0];
      if (!file) return;
      clearPendingImport();
      try {
        const content = await file.text();
        const parsed = parseBackgroundPresetBundle(content);
        if (!parsed.ok) {
          input.report.error(`import impossible : ${parsed.errors.join(' ; ')}`);
          return;
        }
        const pending = await requestPreview(content, parsed);
        if (pending === null) return;
        transition({ type: 'selected', pending });
        input.report.ok('import prêt — confirmer ou annuler');
      } catch (error) {
        input.report.error(`import impossible : ${error.message}`);
      } finally {
        elements.importInput.value = '';
      }
    };
    elements.importCancel.onclick = clearPendingImport;
    elements.importConfirm.onclick = confirmImport;
    renderReview();
  }

  return { initialize };
}
