// @ts-check
import { backgroundPresetUrl } from '../background-selection.js';
import { BUILTIN_BACKGROUND_PRESETS } from './builtin-background-presets.js';
import { backgroundEffectLabel } from './component-field-schemas.js';
import { filterBackgroundPresets } from './background-preset-library.js';
import { createBackgroundPresetTransferController } from './background-preset-transfer-controller.js';

/**
 * @param {{
 *   elements: {
 *     list: HTMLElement,
 *     builtinList: HTMLElement,
 *     name: HTMLInputElement,
 *     tags: HTMLInputElement,
 *     search: HTMLInputElement,
 *     exportButton: HTMLButtonElement,
 *     importTrigger: HTMLButtonElement,
 *     importInput: HTMLInputElement,
 *     importReview: HTMLElement,
 *     importSummary: HTMLElement,
 *     importConfirm: HTMLButtonElement,
 *     importCancel: HTMLButtonElement,
 *     save: HTMLButtonElement,
 *     createNew: HTMLButtonElement,
 *   },
 *   client: ReturnType<typeof import('./background-state-client.js').createBackgroundStateClient>,
 *   preview: ReturnType<typeof import('./background-preview-controller.js').createBackgroundPreviewController>,
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   backgroundPageUrl: string,
 *   documentRef?: Document,
 *   navigatorRef?: Navigator,
 *   windowRef?: Window,
 * }} input
 */
export function createBackgroundPresetController(input) {
  const documentRef = input.documentRef ?? document;
  const navigatorRef = input.navigatorRef ?? navigator;
  const windowRef = input.windowRef ?? window;
  const elements = input.elements;
  let cachedPresets = [];
  let presetQuery = '';

  function reportClientError(prefix, error) {
    input.report.error(`${prefix} : ${error.message}`);
  }

  function appendEmptyState(container) {
    const empty = documentRef.createElement('p');
    empty.className = 'preset-empty';
    empty.textContent = 'Aucun preset ne correspond à cette recherche.';
    container.appendChild(empty);
  }

  function createPresetRowShell(preset, metaText) {
    const row = documentRef.createElement('div');
    row.className = 'preset-row';
    const load = documentRef.createElement('button');
    load.className = 'preset-load';
    load.textContent = `${preset.name} — ${backgroundEffectLabel(preset.component)}`;
    const meta = documentRef.createElement('span');
    meta.className = 'preset-meta';
    meta.textContent = metaText;
    return { row, load, meta };
  }

  function renderPresets(presets) {
    cachedPresets = presets;
    elements.exportButton.disabled = presets.length === 0;
    elements.list.replaceChildren();
    const visiblePresets = filterBackgroundPresets(presets, presetQuery);
    if (visiblePresets.length === 0) appendEmptyState(elements.list);

    for (const preset of visiblePresets) {
      const { row, load, meta } = createPresetRowShell(
        preset,
        [`#${preset.id}`, ...(preset.tags ?? [])].join(' · '),
      );
      load.onclick = () => {
        input.preview.apply(preset, preset.id, true);
        elements.name.value = preset.name;
      };

      const copyUrl = documentRef.createElement('button');
      copyUrl.className = 'preset-action';
      copyUrl.textContent = 'URL';
      copyUrl.title = `Copier l'URL OBS stable du preset « ${preset.name} »`;
      copyUrl.onclick = async () => {
        const url = backgroundPresetUrl(
          preset.id,
          input.backgroundPageUrl,
          { performance: input.preview.quality() === 'performance' },
        );
        await navigatorRef.clipboard.writeText(url);
        copyUrl.textContent = '✓';
        windowRef.setTimeout(() => { copyUrl.textContent = 'URL'; }, 1200);
      };

      const rename = documentRef.createElement('button');
      rename.className = 'preset-action';
      rename.textContent = '✎';
      rename.title = 'Renommer sans modifier l’URL OBS';
      rename.onclick = () => {
        const edit = documentRef.createElement('div');
        edit.className = 'preset-edit';
        const name = documentRef.createElement('input');
        name.value = preset.name;
        name.maxLength = 60;
        const save = documentRef.createElement('button');
        save.textContent = 'Valider';
        save.onclick = async () => {
          try {
            await input.client.renamePreset(preset.id, name.value.trim());
            input.report.ok();
            refresh();
          } catch (error) {
            reportClientError('rename-preset', error);
          }
        };
        const cancel = documentRef.createElement('button');
        cancel.textContent = 'Annuler';
        cancel.onclick = () => renderPresets(cachedPresets);
        edit.append(name, save, cancel);
        row.replaceChildren(edit);
        name.focus();
      };

      const duplicate = documentRef.createElement('button');
      duplicate.className = 'preset-action';
      duplicate.textContent = '⧉';
      duplicate.title = 'Dupliquer';
      duplicate.onclick = async () => {
        try {
          await input.client.duplicatePreset(preset.id);
          input.report.ok();
          refresh();
        } catch (error) {
          reportClientError('duplicate-preset', error);
        }
      };

      const remove = documentRef.createElement('button');
      remove.className = 'preset-delete';
      remove.textContent = '✕';
      remove.onclick = () => {
        const label = documentRef.createElement('span');
        label.className = 'confirm-label';
        label.textContent = `Supprimer « ${preset.name} » ?`;
        const yes = documentRef.createElement('button');
        yes.className = 'confirm-yes';
        yes.textContent = 'Oui';
        yes.onclick = async () => {
          try {
            await input.client.deletePreset(preset.id);
            input.report.ok();
            if (input.preview.snapshot().activePresetId === preset.id) {
              input.preview.setActivePresetId(null);
            }
            refresh();
          } catch (error) {
            reportClientError('delete-preset', error);
          }
        };
        const no = documentRef.createElement('button');
        no.className = 'confirm-no';
        no.textContent = 'Non';
        no.onclick = () => renderPresets(cachedPresets);
        row.replaceChildren(label, yes, no);
      };

      row.append(load, copyUrl, rename, duplicate, remove, meta);
      elements.list.appendChild(row);
    }
  }

  function uniquePresetName(base) {
    const names = new Set(cachedPresets.map(({ name }) => name));
    if (!names.has(base)) return base;
    for (let suffix = 2; ; suffix += 1) {
      const ending = ` ${suffix}`;
      const candidate = `${base.slice(0, 60 - ending.length).trimEnd()}${ending}`;
      if (!names.has(candidate)) return candidate;
    }
  }

  function renderBuiltinPresets() {
    elements.builtinList.replaceChildren();
    const visiblePresets = filterBackgroundPresets(BUILTIN_BACKGROUND_PRESETS, presetQuery);
    if (visiblePresets.length === 0) appendEmptyState(elements.builtinList);
    for (const preset of visiblePresets) {
      const { row, load: apply, meta } = createPresetRowShell(preset, preset.tags.join(' · '));
      apply.onclick = () => {
        input.preview.apply(preset, null, true);
        elements.name.value = preset.name;
      };
      const add = documentRef.createElement('button');
      add.className = 'preset-action';
      add.textContent = 'Ajouter';
      add.onclick = async () => {
        const name = uniquePresetName(`${preset.name} — perso`);
        try {
          await input.client.savePreset({
            name,
            component: preset.component,
            options: preset.options,
            tags: preset.tags,
          });
          input.report.ok();
          refresh();
        } catch (error) {
          reportClientError('save-preset', error);
        }
      };
      row.append(apply, add, meta);
      elements.builtinList.appendChild(row);
    }
  }

  async function refresh() {
    try {
      const file = await input.client.readState();
      renderPresets(file.presets);
      return file.presets;
    } catch (error) {
      reportClientError('lecture des presets impossible', error);
      return null;
    }
  }

  const transfers = createBackgroundPresetTransferController({
    elements: {
      exportButton: elements.exportButton,
      importTrigger: elements.importTrigger,
      importInput: elements.importInput,
      importReview: elements.importReview,
      importSummary: elements.importSummary,
      importConfirm: elements.importConfirm,
      importCancel: elements.importCancel,
      presetName: elements.name,
    },
    client: input.client,
    preview: input.preview,
    report: input.report,
    getPresets: () => cachedPresets,
    refreshPresets: refresh,
    documentRef,
    windowRef,
  });

  function initialize() {
    elements.save.onclick = async () => {
      const name = elements.name.value.trim();
      const tags = [...new Set(
        elements.tags.value.split(',').map((tag) => tag.trim()).filter(Boolean),
      )];
      const { current, activePresetId } = input.preview.snapshot();
      if (current.component === null) {
        input.report.error('rien à sauvegarder — aucun effet sélectionné');
        return;
      }
      try {
        await input.client.savePreset({
          id: activePresetId ?? undefined,
          name,
          component: current.component,
          options: current.options,
          tags,
        });
        input.report.ok();
        const presets = await refresh();
        const savedPreset = presets?.find((preset) => preset.name === name);
        if (savedPreset) input.preview.setActivePresetId(savedPreset.id);
      } catch (error) {
        reportClientError('save-preset', error);
      }
    };

    elements.createNew.onclick = () => {
      input.preview.setActivePresetId(null);
      elements.name.value = '';
      elements.tags.value = '';
      elements.name.focus();
    };
    elements.search.oninput = () => {
      presetQuery = elements.search.value;
      renderBuiltinPresets();
      renderPresets(cachedPresets);
    };
    transfers.initialize();
    renderBuiltinPresets();
  }

  return {
    initialize,
    refresh,
    renderPresets,
    focusSearch() {
      elements.search.focus();
      elements.search.scrollIntoView({ block: 'center' });
    },
  };
}
