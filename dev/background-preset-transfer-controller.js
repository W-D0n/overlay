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
import { errorMessage } from './error-message.js';
import { BackgroundStateClientError } from './background-state-client.js';
import { packAssets, referencedAssetIds } from './bundle-assets.js';

/**
 * Parcours autonome d’export et d’import confirmé de la bibliothèque de presets.
 *
 * Les images que les scènes utilisent voyagent dans le lot (version 4) : à l'export elles sont lues dans la médiathèque (`assets`),
 * à l'import elles y sont rangées avant que les scènes ne le soient, et seules les scènes (jamais les images) partent au serveur
 * pour l'aperçu et l'import. Une image dont le contenu ne correspond pas à son identifiant fait refuser l'import.
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
 *   getPresets: () => import('./background-state-format.js').BackgroundPreset[],
 *   getScenes?: () => import('../scene-doc.js').SceneDoc[],
 *   assets?: {
 *     catalog: () => import('./asset-client.js').LibraryAsset[],
 *     download: (id: string) => Promise<Uint8Array>,
 *     upload: (file: Blob & { name: string }) => Promise<{ asset: { id: string }, created: boolean }>,
 *   },
 *   refreshPresets: () => Promise<import("../scene-doc.js").SceneDoc[] | null>,
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

  /** @param {Parameters<typeof reduceBackgroundPresetImportReview>[1]} event */
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

  /** @param {string} content @param {{ presets: { id: string }[], assets?: import('./bundle-assets.js').BundleAsset[] }} parsed */
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
      input.report.error(`aperçu d’import impossible : ${errorMessage(error)}`);
      return null;
    }
  }

  /**
   * Range les images du lot dans la médiathèque. Le serveur calcule l'empreinte du contenu : un identifiant qui ne correspond pas
   * est un lot altéré ou corrompu, il est refusé avant que la moindre scène ne soit importée.
   * @param {import('./bundle-assets.js').BundleAsset[]} bundleAssets
   */
  async function storeBundleAssets(bundleAssets) {
    if (bundleAssets.length === 0) return;
    if (input.assets === undefined) throw new Error('ce lot contient des images, mais la médiathèque est indisponible');
    for (const entry of bundleAssets) {
      const file = Object.assign(new BlobImpl([entry.bytes]), { name: entry.name });
      const stored = await input.assets.upload(file);
      if (stored.asset.id !== entry.id) throw new Error(`l’image « ${entry.name} » ne correspond pas à son identifiant : lot altéré ou corrompu`);
    }
  }

  /**
   * Les images que ces presets et ces scènes utilisent, lues dans la médiathèque et mises en base64.
   * @param {unknown[]} presets @param {unknown[]} scenes
   */
  async function collectBundleAssets(presets, scenes) {
    const ids = referencedAssetIds(presets, scenes);
    if (ids.length === 0 || input.assets === undefined) return { packed: [], missing: ids.length === 0 ? 0 : ids.length };
    const catalog = input.assets.catalog();
    /** @type {{ meta: { id: string, name: string, type: string }, bytes: Uint8Array }[]} */
    const entries = [];
    let missing = 0;
    for (const id of ids) {
      const meta = catalog.find((asset) => asset.id === id);
      if (meta === undefined) { missing += 1; continue; }
      try {
        entries.push({ meta, bytes: await input.assets.download(id) });
      } catch {
        missing += 1;
      }
    }
    return { packed: packAssets(entries), missing };
  }

  async function confirmImport() {
    const command = transition({ type: 'confirmed' });
    if (command === null) return;
    const { pending } = command;
    try {
      await storeBundleAssets(pending.parsed.assets ?? []);
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
      if (error instanceof BackgroundStateClientError && error.status === 409) {
        const refreshed = await requestPreview(pending.content, pending.parsed);
        if (refreshed === null) {
          transition({ type: 'cancelled' });
          return;
        }
        transition({ type: 'selected', pending: refreshed });
        input.report.error('bibliothèque modifiée — résumé actualisé, confirmer à nouveau');
        return;
      }
      input.report.error(`import-presets : ${errorMessage(error)}`);
    }
  }

  function initialize() {
    elements.exportButton.onclick = async () => {
      const presets = input.getPresets();
      const scenes = input.getScenes?.() ?? [];
      const { packed, missing } = await collectBundleAssets(presets, scenes);
      const content = `${JSON.stringify(createBackgroundPresetBundle(presets, scenes, packed), null, 2)}\n`;
      const url = urlApi.createObjectURL(new BlobImpl([content], { type: 'application/json' }));
      const link = documentRef.createElement('a');
      link.href = url;
      link.download = 'overlay-background-presets.json';
      link.click();
      windowRef.setTimeout(() => urlApi.revokeObjectURL(url), 0);
      const total = presets.length + scenes.length;
      const images = packed.length === 0 ? '' : ` · ${packed.length === 1 ? '1 image incluse' : `${packed.length} images incluses`}`;
      const message = `${total} scène(s) exportée(s)${scenes.length === 0 ? '' : ` (dont ${scenes.length} à plusieurs couches)`}${images}`;
      // Une image que les scènes utilisent mais que la médiathèque n'a plus ne peut pas voyager : l'export est incomplet, on le dit.
      if (missing > 0) input.report.error(`${message} · ${missing === 1 ? '1 image manquante, non exportée' : `${missing} images manquantes, non exportées`}`);
      else input.report.ok(message);
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
        // Le serveur ne reçoit que les scènes : les images restent ici jusqu'à la confirmation.
        const serverContent = JSON.stringify(createBackgroundPresetBundle(parsed.presets, parsed.scenes));
        const pending = await requestPreview(serverContent, parsed);
        if (pending === null) return;
        transition({ type: 'selected', pending });
        const images = parsed.assets.length;
        input.report.ok(`import prêt${images === 0 ? '' : ` (${images === 1 ? '1 image' : `${images} images`} à ajouter à la médiathèque)`} — confirmer ou annuler`);
      } catch (error) {
        input.report.error(`import impossible : ${errorMessage(error)}`);
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
