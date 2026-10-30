// @ts-check
import { normalizeColorPalette } from './color-palette-format.js';
import { createBackgroundPresetController } from './background-preset-controller.js';
import { isAudioOn, kindCapabilities } from '../layer-kinds.js';
import { createBackgroundPreviewController } from './background-preview-controller.js';
import { createAntennaController } from './antenna-controller.js';
import { createServerControlController } from './server-control-controller.js';
import { createDiagnosticController } from './diagnostic-controller.js';
import { createHistoryController } from './history-controller.js';
import { createLayersPanelController } from './layers-panel-controller.js';
import { createLayerInspectorController } from './layer-inspector-controller.js';
import { createCanvasOverlayController } from './canvas-overlay-controller.js';
import { createViewAidsController } from './view-aids-controller.js';
import { createLayerClipboard } from './layer-clipboard.js';
import { createStudioCommands } from './studio-commands.js';
import { createCommandPaletteController } from './command-palette-controller.js';
import { createContextMenuController } from './context-menu-controller.js';
import { createPublicationController } from './publication-controller.js';
import { bindStudioShortcuts } from './studio-shortcuts.js';
import { createCustomCommandStore, createMacroRecorder } from './custom-commands.js';
import { createStudioSettingsSync } from './studio-settings-sync.js';
import { createEditHistoryController } from './edit-history-controller.js';
import { createSettingsSyncIndicator } from './settings-sync-indicator.js';
import { createCustomCommandsController } from './custom-commands-controller.js';
import { BACKGROUND_FIELD_SCHEMAS } from './component-field-schemas.js';
import { isIdentityKind } from '../layer-kinds.js';
import { BACKGROUND_COMPONENT_NAMES, backgroundEffectLabel, defaultBackgroundOptions } from './component-field-schemas.js';
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
  // Les réglages du Studio (commandes personnalisées, préférences) viennent du serveur : ils suivent l'utilisateur d'un
  // navigateur à l'autre. Lus avant la construction des panneaux, puisqu'ils les consultent au départ.
  /** @type {Pick<Storage, 'getItem' | 'setItem'> | null} */
  let storage = null;
  try {
    storage = windowRef.localStorage;
  } catch {
    // Stockage refusé : le serveur reste la référence, le presse-papiers reste en mémoire pour la session.
  }
  const settings = createStudioSettingsSync({ client, storage, onError: (message) => console.warn(`[background-tuner] ${message}`) });
  await settings.load();
  const syncIndicator = createSettingsSyncIndicator({ element: byId('settings-sync'), source: settings });
  windowRef.addEventListener('pagehide', () => { settings.flush(); });
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
    effectTarget: byId('effect-target'),
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

  /** @type {ReturnType<typeof createContextMenuController> | null} */
  let contextMenu = null;
  const layersPanel = createLayersPanelController({
    elements: {
      list: byId('layers-list'),
      empty: byId('layers-empty'),
      gauge: byId('layers-gauge'),
      gaugeFill: byId('layers-gauge-fill'),
      gaugeHint: byId('layers-gauge-hint'),
      undo: /** @type {HTMLButtonElement} */ (byId('layers-undo')),
      redo: /** @type {HTMLButtonElement} */ (byId('layers-redo')),
      add: /** @type {HTMLButtonElement} */ (byId('layers-add')),
      solo: /** @type {HTMLButtonElement} */ (byId('layers-solo')),
      duplicate: /** @type {HTMLButtonElement} */ (byId('layers-duplicate')),
      remove: /** @type {HTMLButtonElement} */ (byId('layers-remove')),
      up: /** @type {HTMLButtonElement} */ (byId('layers-up')),
      down: /** @type {HTMLButtonElement} */ (byId('layers-down')),
      gallery: /** @type {HTMLDialogElement} */ (byId('layer-gallery')),
      galleryGrid: byId('gallery-grid'),
      galleryStatus: byId('gallery-status'),
      galleryClose: /** @type {HTMLButtonElement} */ (byId('gallery-close')),
    },
    studio: preview.document,
    labelOf: backgroundEffectLabel,
    addableKinds: [...BACKGROUND_COMPONENT_NAMES, 'branding'],
    defaultOptions: defaultBackgroundOptions,
    report,
    onContextMenu: (x, y) => contextMenu?.open(x, y),
    documentRef,
    windowRef,
  });

  const layerInspector = createLayerInspectorController({
    preferences: settings,
    elements: {
      empty: byId('inspector-empty'),
      body: byId('inspector-body'),
      opacityRange: /** @type {HTMLInputElement} */ (byId('inspector-opacity-range')),
      opacityNumber: /** @type {HTMLInputElement} */ (byId('inspector-opacity')),
      fields: {
        x: /** @type {HTMLInputElement} */ (byId('inspector-x')),
        y: /** @type {HTMLInputElement} */ (byId('inspector-y')),
        width: /** @type {HTMLInputElement} */ (byId('inspector-width')),
        height: /** @type {HTMLInputElement} */ (byId('inspector-height')),
      },
      unitPercent: /** @type {HTMLButtonElement} */ (byId('inspector-unit-percent')),
      unitPixel: /** @type {HTMLButtonElement} */ (byId('inspector-unit-pixel')),
      lock: /** @type {HTMLButtonElement} */ (byId('inspector-lock')),
      preset: /** @type {HTMLSelectElement} */ (byId('inspector-preset')),
      reset: /** @type {HTMLButtonElement} */ (byId('inspector-reset')),
      reference: /** @type {HTMLSelectElement} */ (byId('inspector-reference')),
      align: {
        left: /** @type {HTMLButtonElement} */ (byId('align-left')),
        hcenter: /** @type {HTMLButtonElement} */ (byId('align-hcenter')),
        right: /** @type {HTMLButtonElement} */ (byId('align-right')),
        top: /** @type {HTMLButtonElement} */ (byId('align-top')),
        vcenter: /** @type {HTMLButtonElement} */ (byId('align-vcenter')),
        bottom: /** @type {HTMLButtonElement} */ (byId('align-bottom')),
      },
      distributeH: /** @type {HTMLButtonElement} */ (byId('distribute-h')),
      distributeV: /** @type {HTMLButtonElement} */ (byId('distribute-v')),
    },
    studio: preview.document,
    report,
    documentRef,
    windowRef,
  });

  const canvasOverlay = createCanvasOverlayController({
    area: byId('stage-area'),
    overlay: byId('canvas-overlay'),
    stage,
    studio: preview.document,
    isIdentity: isIdentityKind,
    report,
    onContextMenu: (x, y) => contextMenu?.open(x, y),
    documentRef,
    windowRef,
  });

  const viewAids = createViewAidsController({
    preferences: settings,
    area: byId('stage-area'),
    stage,
    canvasOverlay,
    elements: {
      zoomOut: /** @type {HTMLButtonElement} */ (byId('view-zoom-out')),
      zoomIn: /** @type {HTMLButtonElement} */ (byId('view-zoom-in')),
      zoomLabel: /** @type {HTMLButtonElement} */ (byId('view-zoom-label')),
      zoom100: /** @type {HTMLButtonElement} */ (byId('view-zoom-100')),
      snap: /** @type {HTMLButtonElement} */ (byId('view-snap')),
      grid: /** @type {HTMLButtonElement} */ (byId('view-grid')),
      rulers: /** @type {HTMLButtonElement} */ (byId('view-rulers')),
      safe: /** @type {HTMLButtonElement} */ (byId('view-safe')),
    },
    documentRef,
    windowRef,
  });

  const publication = createPublicationController({
    elements: {
      changes: /** @type {HTMLButtonElement} */ (byId('publish-changes')),
      compare: /** @type {HTMLButtonElement} */ (byId('publish-compare')),
      test: /** @type {HTMLButtonElement} */ (byId('publish-test')),
      dialog: /** @type {HTMLDialogElement} */ (byId('changes-dialog')),
      summary: byId('changes-summary'),
      list: byId('changes-list'),
      send: /** @type {HTMLButtonElement} */ (byId('changes-send')),
      close: /** @type {HTMLButtonElement} */ (byId('changes-close')),
    },
    studio: preview.document,
    preview,
    labelOf: backgroundEffectLabel,
    optionLabel: (kind, key) => BACKGROUND_FIELD_SCHEMAS[kind]?.find((field) => field.key === key)?.label ?? key,
    documentRef,
  });

  const editHistory = createEditHistoryController({
    elements: {
      dialog: /** @type {HTMLDialogElement} */ (byId('edits-dialog')),
      list: byId('edits-list'),
      summary: byId('edits-summary'),
      close: /** @type {HTMLButtonElement} */ (byId('edits-close')),
      open: /** @type {HTMLButtonElement} */ (byId('layers-history')),
    },
    editor: preview.editor,
    labelOf: backgroundEffectLabel,
    optionLabel: (kind, key) => BACKGROUND_FIELD_SCHEMAS[kind]?.find((field) => field.key === key)?.label ?? key,
    report,
    documentRef,
  });
  const addableKinds = [...BACKGROUND_COMPONENT_NAMES, 'branding'];
  /** @type {ReturnType<typeof createCommandPaletteController> | null} */
  let palette = null;
  /** @type {ReturnType<typeof createCustomCommandsController> | null} */
  let customCommands = null;
  const commands = createStudioCommands({
    studio: preview.document,
    clipboard: createLayerClipboard({ storage }),
    labelOf: backgroundEffectLabel,
    addableKinds,
    defaultOptions: defaultBackgroundOptions,
    view: {
      zoomIn: () => stage.stepZoom(1),
      zoomOut: () => stage.stepZoom(-1),
      fit: () => stage.fit(),
      zoom100: () => stage.setScale(1),
      toggle: (key) => viewAids.toggle(key),
    },
    publication,
    dialogs: {
      palette: () => palette?.open(),
      shortcuts: () => palette?.openHelp(),
      history: () => byId('history-open').click(),
      editHistory: () => editHistory.open(),
      diagnostic: () => byId('diagnostic-open').click(),
    },
    customCommands: {
      open: () => customCommands?.open(),
      create: () => customCommands?.create(),
      startRecording: () => customCommands?.startRecording(),
      isRecording: () => customCommands?.isRecording() ?? false,
    },
    report,
  });
  customCommands = createCustomCommandsController({
    registry: commands,
    store: createCustomCommandStore({ backend: settings }),
    recorder: createMacroRecorder(commands, { subscribe: (listener) => preview.editor.onOperation(listener), kindOf: (id) => preview.editor.state().scene.layers.find((layer) => layer.id === id)?.kind }),
    batch: (label, run) => preview.editor.batch(label, run),
    editor: preview.editor,
    kindLabel: backgroundEffectLabel,
    report,
    elements: {
      dialog: /** @type {HTMLDialogElement} */ (byId('custom-commands')),
      list: byId('cc-list'),
      empty: byId('cc-empty'),
      create: /** @type {HTMLButtonElement} */ (byId('cc-create')),
      record: /** @type {HTMLButtonElement} */ (byId('cc-record')),
      importButton: /** @type {HTMLButtonElement} */ (byId('cc-import')),
      exportButton: /** @type {HTMLButtonElement} */ (byId('cc-export')),
      close: /** @type {HTMLButtonElement} */ (byId('cc-close')),
      editor: byId('cc-editor'),
      name: /** @type {HTMLInputElement} */ (byId('cc-name')),
      shortcut: /** @type {HTMLButtonElement} */ (byId('cc-shortcut')),
      shortcutClear: /** @type {HTMLButtonElement} */ (byId('cc-shortcut-clear')),
      steps: byId('cc-steps'),
      stepSearch: /** @type {HTMLInputElement} */ (byId('cc-step-search')),
      stepResults: byId('cc-step-results'),
      errors: byId('cc-errors'),
      save: /** @type {HTMLButtonElement} */ (byId('cc-save')),
      test: /** @type {HTMLButtonElement} */ (byId('cc-test')),
      cancel: /** @type {HTMLButtonElement} */ (byId('cc-cancel')),
      io: byId('cc-io'),
      ioText: /** @type {HTMLTextAreaElement} */ (byId('cc-io-text')),
      ioConfirm: /** @type {HTMLButtonElement} */ (byId('cc-io-confirm')),
      ioCopy: /** @type {HTMLButtonElement} */ (byId('cc-io-copy')),
      ioCancel: /** @type {HTMLButtonElement} */ (byId('cc-io-cancel')),
      ioStatus: byId('cc-io-status'),
      bar: byId('macro-bar'),
      barCount: byId('macro-count'),
      barSteps: byId('macro-steps'),
      barFinish: /** @type {HTMLButtonElement} */ (byId('macro-finish')),
      barCancel: /** @type {HTMLButtonElement} */ (byId('macro-cancel')),
    },
    documentRef,
    navigatorRef,
  });
  palette = createCommandPaletteController({
    registry: commands,
    palette: /** @type {HTMLDialogElement} */ (byId('command-palette')),
    input: /** @type {HTMLInputElement} */ (byId('palette-input')),
    list: byId('palette-list'),
    help: /** @type {HTMLDialogElement} */ (byId('shortcuts-help')),
    helpBody: byId('help-body'),
    helpClose: /** @type {HTMLButtonElement} */ (byId('help-close')),
    documentRef,
  });
  contextMenu = createContextMenuController({ menu: byId('context-menu'), registry: commands, documentRef });
  const shortcuts = bindStudioShortcuts({ registry: commands, documentRef });

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

  createServerControlController({
    root: byId('servers'),
    status: byId('servers-status'),
    client,
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
      // Le micro n'est utile que si une couche visible de la scène brouillon réagit au son.
      const wanted = preview.snapshot().scene.layers.some((layer) => layer.visible
        && kindCapabilities(layer.kind).audio
        && isAudioOn(layer.options.audioReactive));
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
    preview.receive({ scene: file.scene });
    brandingControls.render(file.branding);
    presets.renderPresets(file.scenes);
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
  // Les commandes modifiées ailleurs (autre fenêtre) rejoignent le registre ; un réglage qui n'y touche pas ne le dérange pas.
  let knownCommands = JSON.stringify(settings.getCommands());
  settings.subscribe(() => {
    const current = JSON.stringify(settings.getCommands());
    if (current === knownCommands) return;
    knownCommands = current;
    customCommands?.reload();
  });
  const unsubscribe = client.subscribe({
    onSettings: (value) => settings.applyRemote(value),
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
    syncIndicator.destroy();
    editHistory.destroy();
    shortcuts.destroy();
    contextMenu?.destroy();
    publication.destroy();
    viewAids.destroy();
    canvasOverlay.destroy();
    layersPanel.destroy();
    antenna.destroy();
    diagnostic.destroy();
    history.destroy();
    stage.destroy();
    unsubscribe();
    preview.destroy();
  }
  windowRef.addEventListener('beforeunload', destroy, { once: true });
  return { destroy, antenna, presets, preview, obsSceneMap, brandingControls, layersPanel, layerInspector, canvasOverlay, viewAids, commands, publication, customCommands };
}
