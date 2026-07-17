// @ts-check
import { normalizeColorPalette } from './color-palette-format.js';
import { createBackgroundPresetController } from './background-preset-controller.js';
import { createBackgroundPreviewController } from './background-preview-controller.js';
import { createBackgroundReadinessController } from './background-readiness-controller.js';
import {
  BackgroundStateClientError,
  createBackgroundStateClient,
} from './background-state-client.js';

const STATE_SERVER = 'http://localhost:4462';

/** @param {unknown} error */
export function stateLoadErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof BackgroundStateClientError && error.status !== null) {
    return `GET /state : ${message}`;
  }
  return `serveur d'état injoignable — lancer start-dev/start-stream (${message})`;
}

/**
 * Point d’entrée unique du tuner. Il câble les modules de requêtes, d’aperçu, de champs, de
 * presets et de contrôle pré-live sans réimplémenter leurs responsabilités.
 *
 * @param {{ documentRef?: Document, windowRef?: Window, navigatorRef?: Navigator }} [environment]
 */
export async function startBackgroundTuner(environment = {}) {
  const documentRef = environment.documentRef ?? document;
  const windowRef = environment.windowRef ?? window;
  const navigatorRef = environment.navigatorRef ?? navigator;
  const byId = (id) => documentRef.getElementById(id);

  const serverStatus = byId('server-status');
  const report = {
    error(message) {
      serverStatus.textContent = message;
      serverStatus.classList.add('error');
    },
    ok(message = 'connecté au serveur d\'état (4462)') {
      serverStatus.textContent = message;
      serverStatus.classList.remove('error');
    },
  };

  const sidebar = byId('sidebar');
  const sidebarToggle = byId('sidebar-toggle');
  sidebarToggle.onclick = () => {
    sidebar.classList.toggle('collapsed');
    sidebarToggle.textContent = sidebar.classList.contains('collapsed') ? '▶' : '◀';
  };

  const client = createBackgroundStateClient({ baseUrl: STATE_SERVER });
  const preview = createBackgroundPreviewController({
    layer: byId('bg-layer'),
    effectSelect: byId('effect-select'),
    fields: byId('fields'),
    presetName: byId('preset-name'),
    presetTags: byId('preset-tags'),
    presetSave: byId('preset-save'),
    qualitySelect: byId('quality-select'),
    runtimeStatus: byId('runtime-status'),
    client,
    report,
    documentRef,
    windowRef,
  });

  const presets = createBackgroundPresetController({
    elements: {
      list: byId('preset-list'),
      builtinList: byId('builtin-list'),
      name: byId('preset-name'),
      tags: byId('preset-tags'),
      search: byId('preset-search'),
      exportButton: byId('preset-export'),
      importTrigger: byId('preset-import-trigger'),
      importInput: byId('preset-import'),
      importReview: byId('preset-import-review'),
      importSummary: byId('preset-import-summary'),
      importConfirm: byId('preset-import-confirm'),
      importCancel: byId('preset-import-cancel'),
      save: byId('preset-save'),
      createNew: byId('preset-new'),
    },
    client,
    preview,
    report,
    backgroundPageUrl: new URL('../background.html', windowRef.location.href).href,
    documentRef,
    navigatorRef,
    windowRef,
  });

  const readiness = createBackgroundReadinessController({
    root: byId('live-readiness'),
    title: byId('live-readiness-title'),
    summary: byId('live-readiness-summary'),
    checks: byId('live-readiness-checks'),
    runButton: byId('live-readiness-run'),
    stateServer: STATE_SERVER,
    getSelection() {
      return {
        presetId: preview.snapshot().activePresetId,
        quality: preview.quality(),
      };
    },
    getRuntime: preview.runtimeMeasurement,
    focusEffect: preview.focusEffect,
    focusPresets: presets.focusSearch,
    documentRef,
    navigatorRef,
    windowRef,
  });

  try {
    const response = await windowRef.fetch('../components/color-palette.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    preview.setPalette(normalizeColorPalette(await response.json()));
  } catch (error) {
    console.warn('[background-tuner] palette indisponible, saisie libre conservée :', error);
  }

  try {
    const file = await client.readState();
    preview.apply(file.current);
    presets.renderPresets(file.presets);
    report.ok();
  } catch (error) {
    report.error(stateLoadErrorMessage(error));
  }

  presets.initialize();
  const unsubscribe = client.subscribe({
    onCurrent: preview.receive,
    onPresets: presets.refresh,
    onError(error) {
      console.warn('[background-tuner] message temps réel invalide :', error);
    },
  });
  const readinessTimer = windowRef.setTimeout(readiness.run, 1200);

  function destroy() {
    windowRef.clearTimeout(readinessTimer);
    unsubscribe();
    preview.destroy();
  }
  windowRef.addEventListener('beforeunload', destroy, { once: true });
  return { destroy, readiness, presets, preview };
}
