// @ts-check
import { normalizeColorPalette } from './color-palette-format.js';
import { createBackgroundPresetController } from './background-preset-controller.js';
import { isAudioOn, kindCapabilities } from '../layer-kinds.js';
import { createBackgroundPreviewController } from './background-preview-controller.js';
import { createAntennaController } from './antenna-controller.js';
import { createIncidentWatcher } from './incident-watch.js';
import { createIncidentNotifier } from './incident-notifier.js';
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
import { createAnnouncer } from './announcer.js';
import { createObsViewController } from './obs-view-controller.js';
import { createLayerCostController } from './layer-cost-controller.js';
import { createTemplatesController } from './templates-controller.js';
import { installScrubFields } from './scrub-field.js';
import { createEditHistoryController } from './edit-history-controller.js';
import { createSettingsSyncIndicator } from './settings-sync-indicator.js';
import { createCustomCommandsController } from './custom-commands-controller.js';
import { BACKGROUND_FIELD_SCHEMAS } from './component-field-schemas.js';
import { isIdentityKind } from '../layer-kinds.js';
import { ADDABLE_KIND_IDS, backgroundEffectLabel, defaultBackgroundOptions } from './component-field-schemas.js';
import { createAssetClient } from './asset-client.js';
import { createAnimationController } from './animation-controller.js';
import { createBindingsController } from './bindings-controller.js';
import { createFiltersController } from './filters-controller.js';
import { createMaskController } from './mask-controller.js';
import { createMaskHandlesController } from './mask-handles-controller.js';
import { createVersionClient } from './version-client.js';
import { createConnectionClient } from './connection-client.js';
import { createSettingsController } from './settings-controller.js';
import { createTimelineController } from './timeline-controller.js';
import { setIcon } from './icons.js';
import { createVersionsController } from './versions-controller.js';
import { collectAssetUsage } from './asset-format.js';
import { createAssetLibraryController } from './asset-library-controller.js';
import { assetUrl } from '../components/asset-image.js';
import { assetFonts } from '../components/asset-font.js';
import { placementForImage } from '../components/image-fit.js';
import { RENDER_REFERENCE } from '../render-reference.js';
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
import { errorMessage } from './error-message.js';
import {
  assetLibraryElements,
  layersPanelElements,
  versionsElements,
  settingsElements,
  timelineElements,
  inspectorElements,
  viewAidsElements,
  publicationElements,
  editHistoryElements,
  templatesElements,
  obsViewElements,
  customCommandsElements,
  presetsElements,
} from './studio-elements.js';

const STATE_SERVER = `http://localhost:${BACKGROUND_STATE_PORT}`;

/** @param {unknown} error */
export function stateLoadErrorMessage(error) {
  const message = errorMessage(error);
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
  const assetClient = createAssetClient({ baseUrl: STATE_SERVER });
  const library = createAssetLibraryController({
    elements: assetLibraryElements(byId),
    client: assetClient,
    urlOf: assetUrl,
    loadFont: assetFonts.load,
    // Les images des couches de la scène en cours d'édition : le serveur ne les connaît qu'une fois publiées.
    usedHere: () => collectAssetUsage(preview.document.state().scene),
    report,
    documentRef,
  });
  void library.refresh();
  /** @type {ReturnType<typeof createPresetDraftSync> | null} */
  let drafts = null;
  const preview = createBackgroundPreviewController({
    assetLibrary: { assets: library.assets, subscribe: library.subscribe, open: (choose, accept) => { void library.open({ choose, ...(accept === undefined ? {} : { accept }) }); } },
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

  /** Pose une image de la médiathèque dans la scène : à sa proportion, centrée, dans 80 % de la toile au plus. @param {import('./asset-format.js').AssetMeta} asset */
  function addImageLayer(asset) {
    const result = preview.editor.addLayer({ kind: 'image', options: { ...defaultBackgroundOptions('image'), asset: asset.id }, placement: placementForImage(asset, RENDER_REFERENCE) });
    if (!result.ok) report.error(result.message);
  }
  const pickImage = () => { void library.open({ choose: addImageLayer, accept: 'image' }); };

  // Déposer des images sur l'aperçu les importe et en fait des couches.
  const dropZone = byId('stage-area');
  /** @param {DragEvent} event */
  const carriesFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');
  dropZone.addEventListener('dragover', (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    dropZone.classList.add('is-dropping');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-dropping'));
  dropZone.addEventListener('drop', (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    dropZone.classList.remove('is-dropping');
    void library.importFiles([...(event.dataTransfer?.files ?? [])]).then((assets) => { for (const asset of assets) addImageLayer(asset); });
  });

  /** @type {ReturnType<typeof createContextMenuController> | null} */
  let contextMenu = null;
  const layersPanel = createLayersPanelController({
    elements: layersPanelElements(byId),
    studio: preview.document,
    labelOf: backgroundEffectLabel,
    addableKinds: ADDABLE_KIND_IDS,
    pickImage,
    defaultOptions: defaultBackgroundOptions,
    report,
    onContextMenu: (x, y) => contextMenu?.open(x, y),
    documentRef,
    windowRef,
  });

  const versions = createVersionsController({
    elements: versionsElements(byId),
    studio: preview.document,
    client: createVersionClient({ baseUrl: STATE_SERVER }),
    labelOf: backgroundEffectLabel,
    report,
    documentRef,
  });
  const versionsButton = byId('layers-versions');
  setIcon(versionsButton, 'bookmark');
  versionsButton.addEventListener('click', () => { void versions.open(); });

  const settingsDialog = createSettingsController({
    elements: settingsElements(byId),
    client: createConnectionClient({ baseUrl: STATE_SERVER }),
    report,
  });
  byId('settings-open').addEventListener('click', () => { void settingsDialog.open(); });

  const timelinePanel = createTimelineController({
    elements: timelineElements(byId),
    studio: preview.document,
    timeline: preview.timeline,
    report,
    documentRef,
    windowRef,
  });

  const filters = createFiltersController({
    elements: { body: byId('filters-body'), hint: byId('filters-hint') },
    studio: preview.document,
    report,
    documentRef,
  });

  const mask = createMaskController({
    elements: { body: byId('mask-body'), hint: byId('mask-hint') },
    studio: preview.document,
    report,
    documentRef,
  });

  const maskHandles = createMaskHandlesController({
    overlay: byId('canvas-overlay'),
    toggleHost: byId('mask-body'),
    stage,
    studio: preview.document,
    report,
    documentRef,
  });

  const animation = createAnimationController({
    elements: { body: byId('animation-body'), hint: byId('animation-hint'), replay: /** @type {HTMLButtonElement} */ (byId('animation-replay')) },
    studio: preview.document,
    timeline: preview.timeline,
    report,
    documentRef,
  });

  const bindings = createBindingsController({
    elements: { list: byId('bindings-list'), add: /** @type {HTMLButtonElement} */ (byId('bindings-add')), hint: byId('bindings-hint') },
    studio: preview.document,
    report,
    documentRef,
  });

  const layerInspector = createLayerInspectorController({
    preferences: settings,
    elements: inspectorElements(byId),
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
    elements: viewAidsElements(byId),
    documentRef,
    windowRef,
  });

  const publication = createPublicationController({
    elements: publicationElements(byId),
    studio: preview.document,
    preview,
    labelOf: backgroundEffectLabel,
    optionLabel: (kind, key) => BACKGROUND_FIELD_SCHEMAS[kind]?.find((field) => field.key === key)?.label ?? key,
    documentRef,
  });

  const editHistory = createEditHistoryController({
    elements: editHistoryElements(byId),
    editor: preview.editor,
    labelOf: backgroundEffectLabel,
    optionLabel: (kind, key) => BACKGROUND_FIELD_SCHEMAS[kind]?.find((field) => field.key === key)?.label ?? key,
    report,
    documentRef,
  });
  const templates = createTemplatesController({
    elements: templatesElements(byId),
    settings,
    editor: preview.editor,
    labelOf: backgroundEffectLabel,
    report,
    documentRef,
  });
  const layerCost = createLayerCostController({ list: byId('layers-list'), total: byId('layers-cost'), preview, editor: preview.editor, documentRef, windowRef });
  const obsView = createObsViewController({
    elements: obsViewElements(byId),
    preferences: settings,
    client,
    pageUrl: new URL('../background.html', windowRef.location.href).href,
    windowRef,
  });
  const announcer = createAnnouncer({ element: byId('studio-announcer'), editor: preview.editor, labelOf: backgroundEffectLabel });
  const scrub = installScrubFields({ documentRef });
  const addableKinds = ADDABLE_KIND_IDS;
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
      obs: () => obsView.toggle(),
    },
    publication,
    dialogs: {
      palette: () => palette?.open(),
      shortcuts: () => palette?.openHelp(),
      history: () => byId('history-open').click(),
      editHistory: () => editHistory.open(),
      diagnostic: () => byId('diagnostic-open').click(),
      settings: () => { void settingsDialog.open(); },
      library: () => { void library.open(); },
      versions: () => { void versions.open(); },
      saveVersion: () => { void versions.save(); },
    },
    pickImage,
    templates: { open: () => templates.open(), save: () => templates.save() },
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
    elements: customCommandsElements(byId),
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
    assets: { catalog: library.assets, download: assetClient.download, upload: assetClient.upload },
    elements: presetsElements(byId),
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

  const incidentWatcher = createIncidentWatcher();
  const alertsOn = () => settings.getPreference('alerts.system', /** @type {string} */ ('off')) === 'on';
  const alertsButton = /** @type {HTMLButtonElement} */ (byId('antenna-alerts'));
  const incidents = createIncidentNotifier({
    report,
    isEnabled: alertsOn,
    setEnabled(enabled) {
      settings.setPreference('alerts.system', enabled ? 'on' : 'off');
      alertsButton.setAttribute('aria-pressed', String(enabled));
    },
    documentRef,
  });
  alertsButton.setAttribute('aria-pressed', String(alertsOn()));
  alertsButton.addEventListener('click', () => { void incidents.toggle(); });

  const antenna = createAntennaController({
    onItems: (items) => incidents.deliver(incidentWatcher.observe(items)),
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
    scrub.destroy();
    announcer.destroy();
    obsView.destroy();
    layerCost.destroy();
    templates.destroy();
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
