// @ts-check
import { normalizeColorPalette } from './color-palette-format.js';
import { createBackgroundPresetController } from './background-preset-controller.js';
import { isAudioOn, kindCapabilities } from '../layer-kinds.js';
import { createBackgroundPreviewController } from './background-preview-controller.js';
import { createAntennaController } from './antenna-controller.js';
import { createServerControlController } from './server-control-controller.js';
import { createDiagnosticController } from './diagnostic-controller.js';
import { createHistoryController } from './history-controller.js';
import { createPresetDraftSync } from './preset-draft-sync.js';
import { createObsSceneMapController } from './obs-scene-map-controller.js';
import { createTransitionController } from './background-transition-controller.js';
import { createBrandingController } from './branding-controller.js';
import { createPreviewStage } from './preview-stage.js';
import {
  BackgroundStateClientError,
  createBackgroundStateClient,
} from './background-state-client.js';
import { BACKGROUND_STATE_PORT } from '../ports.config.js';

const STATE_SERVER = `http://localhost:${BACKGROUND_STATE_PORT}`;

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
  /**
   * Un élément absent de la page est une erreur de câblage : on échoue ici plutôt que sur un `null` plus loin.
   * @template {HTMLElement} [T=HTMLElement]
   * @param {string} id
   * @returns {T}
   */
  const byId = (id) => {
    const element = documentRef.getElementById(id);
    if (element === null) throw new Error(`élément #${id} introuvable dans le tuner`);
    return /** @type {T} */ (element);
  };

  const serverStatus = byId('server-status');
  const report = {
    /** @param {string} message */
    error(message) {
      serverStatus.textContent = message;
      serverStatus.classList.add('error');
    },
    ok(message = `connecté au serveur d'état (${BACKGROUND_STATE_PORT})`) {
      serverStatus.textContent = message;
      serverStatus.classList.remove('error');
    },
  };

  const stage = createPreviewStage({ layer: byId('bg-layer'), container: byId('stage-area'), windowRef: /** @type {Window & typeof globalThis} */ (windowRef) });

  const client = createBackgroundStateClient({ baseUrl: STATE_SERVER });
  /** @type {ReturnType<typeof createPresetDraftSync> | null} */
  let drafts = null;
  const preview = createBackgroundPreviewController({
    layer: byId('bg-layer'),
    effectSelect: byId('effect-select'),
    fields: byId('fields'),
    presetName: byId('preset-name'),
    presetTags: byId('preset-tags'),
    presetSave: byId('preset-save'),
    runtimeStatus: byId('runtime-status'),
    onDraftChange(isDraft) {
      byId('publish-bar').dataset.state = isDraft ? 'draft' : 'live';
      byId('publish-state').textContent = isDraft ? 'Brouillon — pas encore en antenne' : 'En antenne';
      byId('publish-send').hidden = !isDraft;
      byId('publish-discard').hidden = !isDraft;
    },
    onEdited: () => drafts?.schedule(),
    client,
    report,
    documentRef,
    windowRef,
  });

  drafts = createPresetDraftSync({
    client,
    snapshot: preview.snapshot,
    onChange: () => presets.syncDraftMarks(),
    onError: report.error,
  });

  byId('publish-send').addEventListener('click', () => preview.publish());
  byId('publish-discard').addEventListener('click', () => preview.discard());

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
      importDetails: byId('preset-import-details'),
      importConfirm: byId('preset-import-confirm'),
      importCancel: byId('preset-import-cancel'),
      save: byId('preset-save'),
      createNew: byId('preset-new'),
    },
    client,
    preview,
    drafts,
    report,
    backgroundPageUrl: new URL('../background.html', windowRef.location.href).href,
    documentRef,
    navigatorRef,
    windowRef,
  });

  for (const button of documentRef.querySelectorAll('[data-event]')) {
    button.addEventListener('click', () => {
      client.sendEvent(String(button.getAttribute('data-event'))).catch((error) => {
        console.warn('[background-tuner] envoi d’événement impossible :', error);
      });
    });
  }

  const serverControl = createServerControlController({
    root: byId('servers'),
    toggle: byId('servers-toggle'),
    panel: byId('servers-panel'),
    status: byId('servers-status'),
    client,
    getRenderPages: () => antenna.renderPages(),
    documentRef,
    windowRef,
  });

  const diagnostic = createDiagnosticController({
    dialog: /** @type {HTMLDialogElement} */ (byId('diagnostic')),
    openButton: /** @type {HTMLButtonElement} */ (byId('diagnostic-open')),
    closeButton: /** @type {HTMLButtonElement} */ (byId('diagnostic-close')),
    refreshButton: /** @type {HTMLButtonElement} */ (byId('diagnostic-refresh')),
    copyButton: /** @type {HTMLButtonElement} */ (byId('diagnostic-copy')),
    summary: byId('diagnostic-summary'),
    list: byId('diagnostic-list'),
    client,
    documentRef,
    windowRef,
  });

  const history = createHistoryController({
    dialog: /** @type {HTMLDialogElement} */ (byId('history')),
    openButton: /** @type {HTMLButtonElement} */ (byId('history-open')),
    closeButton: /** @type {HTMLButtonElement} */ (byId('history-close')),
    summary: byId('history-summary'),
    list: byId('history-list'),
    client,
    documentRef,
    windowRef,
  });

  const antenna = createAntennaController({
    root: byId('antenna'),
    summary: byId('antenna-summary'),
    items: byId('antenna-items'),
    copyButton: byId('antenna-copy'),
    client,
    getActivePresetId: () => preview.snapshot().activePresetId,
    getAudio() {
      const { current } = preview.snapshot();
      const wanted = current.component !== null
        && kindCapabilities(current.component).audio
        && isAudioOn(/** @type {Record<string, unknown>} */ (current.options).audioReactive);
      return wanted ? preview.audioState() : null;
    },
    backgroundPageUrl: new URL('../background.html', windowRef.location.href).href,
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

  const brandingControls = createBrandingController({
    layer: byId('bg-layer'),
    fields: {
      name: byId('branding-name'),
      lines: byId('branding-lines'),
      nameSize: byId('branding-name-size'),
      lineSize: byId('branding-line-size'),
      color: byId('branding-color'),
      opacity: byId('branding-opacity'),
      position: byId('branding-position'),
      showOnPreset: byId('branding-show-on-preset'),
    },
    documentRef,
    client,
    report,
    onShowOnPresetChange: (visible) => preview.changeShowBranding(visible),
  });

  try {
    const file = await client.readState();
    preview.apply(file.current);
    brandingControls.render(file.branding);
    brandingControls.renderShowOnPreset(file.current?.showBranding !== false);
    presets.renderPresets(file.presets);
    report.ok();
  } catch (error) {
    report.error(stateLoadErrorMessage(error));
  }
  await drafts.load();

  preview.attachTransitionControls(createTransitionController({
    typeSelect: byId('transition-type'),
    easingSelect: byId('transition-easing'),
    durationInput: byId('transition-duration'),
    directionSelect: byId('transition-direction'),
    directionRow: byId('transition-direction-row'),
    onChange: preview.changeTransition,
  }));

  preview.attachBrandingControls(brandingControls);

  const obsSceneMap = createObsSceneMapController({
    statusEl: byId('obs-scene-status'),
    rowsEl: byId('obs-scene-rows'),
    filterEl: byId('obs-scene-filter'),
    saveButton: byId('obs-scene-save'),
    refreshButton: byId('obs-scene-refresh'),
    documentRef,
    client,
    report,
  });
  obsSceneMap.refresh();

  presets.initialize();
  const unsubscribe = client.subscribe({
    onCurrent: preview.receive,
    onPresets() {
      presets.refresh();
      // Un preset renommé ou supprimé change les choix possibles d'association.
      obsSceneMap.refresh();
    },
    onEvent: preview.react,
    onError(error) {
      console.warn('[background-tuner] message temps réel invalide :', error);
    },
  });

  function destroy() {
    antenna.destroy();
    serverControl.closePanel();
    diagnostic.destroy();
    history.destroy();
    stage.destroy();
    unsubscribe();
    preview.destroy();
  }
  windowRef.addEventListener('beforeunload', destroy, { once: true });
  return { destroy, antenna, presets, preview, obsSceneMap, brandingControls };
}
