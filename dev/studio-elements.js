// @ts-check
/**
 * dev/studio-elements.js — Which element of `studio.html` each Studio panel takes: one function per panel, from the page's `byId` to the object of elements the panel's controller
 * is built on. Data, not behaviour: `studio-elements.test.js` checks that every id asked for is in the page.
 *
 * @typedef {<T extends HTMLElement = HTMLElement>(id: string) => T} ById an element of the page by id; a missing one is an error
 */

/** The elements of the media library dialog. @param {ById} byId */
export const assetLibraryElements = (byId) => ({
  dialog: /** @type {HTMLDialogElement} */ (byId('asset-library')),
  grid: byId('asset-grid'),
  status: byId('asset-status'),
  importButton: /** @type {HTMLButtonElement} */ (byId('asset-import')),
  fileInput: /** @type {HTMLInputElement} */ (byId('asset-file')),
  close: /** @type {HTMLButtonElement} */ (byId('asset-library-close')),
  hint: byId('asset-library-hint'),
});

/** The elements of the layers panel and the layer gallery. @param {ById} byId */
export const layersPanelElements = (byId) => ({
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
  group: /** @type {HTMLButtonElement} */ (byId('layers-group')),
  ungroup: /** @type {HTMLButtonElement} */ (byId('layers-ungroup')),
  up: /** @type {HTMLButtonElement} */ (byId('layers-up')),
  down: /** @type {HTMLButtonElement} */ (byId('layers-down')),
  gallery: /** @type {HTMLDialogElement} */ (byId('layer-gallery')),
  galleryGrid: byId('gallery-grid'),
  galleryStatus: byId('gallery-status'),
  galleryClose: /** @type {HTMLButtonElement} */ (byId('gallery-close')),
});

/** The elements of the versions dialog. @param {ById} byId */
export const versionsElements = (byId) => ({
  dialog: /** @type {HTMLDialogElement} */ (byId('versions-dialog')),
  title: byId('versions-title'),
  name: /** @type {HTMLInputElement} */ (byId('versions-name')),
  save: /** @type {HTMLButtonElement} */ (byId('versions-save')),
  list: byId('versions-list'),
  status: byId('versions-status'),
  close: /** @type {HTMLButtonElement} */ (byId('versions-close')),
});

/** The elements of the settings dialog. @param {ById} byId */
export const settingsElements = (byId) => ({
  dialog: /** @type {HTMLDialogElement} */ (byId('settings-dialog')),
  close: /** @type {HTMLButtonElement} */ (byId('settings-close')),
  status: byId('settings-status'),
  obsStatus: byId('settings-obs-status'),
  obsUrl: /** @type {HTMLInputElement} */ (byId('settings-obs-url')),
  obsPassword: /** @type {HTMLInputElement} */ (byId('settings-obs-password')),
  obsReveal: /** @type {HTMLButtonElement} */ (byId('settings-obs-reveal')),
  obsSave: /** @type {HTMLButtonElement} */ (byId('settings-obs-save')),
  obsClear: /** @type {HTMLButtonElement} */ (byId('settings-obs-clear')),
  twitchStatus: byId('settings-twitch-status'),
  twitchClient: /** @type {HTMLInputElement} */ (byId('settings-twitch-client')),
  twitchClientSave: /** @type {HTMLButtonElement} */ (byId('settings-twitch-client-save')),
  twitchCode: byId('settings-twitch-code'),
  twitchLink: /** @type {HTMLAnchorElement} */ (byId('settings-twitch-link')),
  twitchUserCode: byId('settings-twitch-usercode'),
  twitchCodeCopy: /** @type {HTMLButtonElement} */ (byId('settings-twitch-code-copy')),
  twitchCancel: /** @type {HTMLButtonElement} */ (byId('settings-twitch-cancel')),
  twitchLogin: /** @type {HTMLButtonElement} */ (byId('settings-twitch-login')),
  twitchLogout: /** @type {HTMLButtonElement} */ (byId('settings-twitch-logout')),
  twitchatStatus: byId('settings-twitchat-status'),
  twitchatAddress: /** @type {HTMLInputElement} */ (byId('settings-twitchat-address')),
  twitchatReveal: /** @type {HTMLButtonElement} */ (byId('settings-twitchat-reveal')),
  twitchatCopy: /** @type {HTMLButtonElement} */ (byId('settings-twitchat-copy')),
  twitchatHostPort: byId('settings-twitchat-hostport'),
  twitchatSampleType: /** @type {HTMLSelectElement} */ (byId('settings-twitchat-sample-type')),
  twitchatSampleToken: /** @type {HTMLInputElement} */ (byId('settings-twitchat-sample-token')),
  twitchatSample: /** @type {HTMLButtonElement} */ (byId('settings-twitchat-sample')),
  twitchatRegenerate: /** @type {HTMLButtonElement} */ (byId('settings-twitchat-regenerate')),
  alerts: byId('settings-alerts'),
});

/** The elements of the timeline panel. @param {ById} byId */
export const timelineElements = (byId) => ({
  panel: byId('timeline-panel'),
  toggle: /** @type {HTMLButtonElement} */ (byId('timeline-toggle')),
  play: /** @type {HTMLButtonElement} */ (byId('timeline-play')),
  restart: /** @type {HTMLButtonElement} */ (byId('timeline-restart')),
  readout: byId('timeline-readout'),
  scrub: /** @type {HTMLInputElement} */ (byId('timeline-scrub')),
  duration: /** @type {HTMLInputElement} */ (byId('timeline-duration')),
  loop: /** @type {HTMLInputElement} */ (byId('timeline-loop')),
  restartOn: byId('timeline-restart-on'),
  title: byId('timeline-title'),
  target: /** @type {HTMLSelectElement} */ (byId('timeline-target')),
  addKey: /** @type {HTMLButtonElement} */ (byId('timeline-add-key')),
  paste: /** @type {HTMLButtonElement} */ (byId('timeline-paste')),
  tracks: byId('timeline-tracks'),
  detail: byId('timeline-detail'),
  detailTime: /** @type {HTMLInputElement} */ (byId('timeline-key-time')),
  detailValue: /** @type {HTMLInputElement} */ (byId('timeline-key-value')),
  detailEase: /** @type {HTMLSelectElement} */ (byId('timeline-key-ease')),
  detailCopy: /** @type {HTMLButtonElement} */ (byId('timeline-key-copy')),
  curve: byId('timeline-curve'),
  detailRemove: /** @type {HTMLButtonElement} */ (byId('timeline-key-remove')),
});

/** The elements of the layer inspector. @param {ById} byId */
export const inspectorElements = (byId) => ({
  empty: byId('inspector-empty'),
  body: byId('inspector-body'),
  opacityRange: /** @type {HTMLInputElement} */ (byId('inspector-opacity-range')),
  opacityNumber: /** @type {HTMLInputElement} */ (byId('inspector-opacity')),
  blend: /** @type {HTMLSelectElement} */ (byId('inspector-blend')),
  rotationRange: /** @type {HTMLInputElement} */ (byId('inspector-rotation-range')),
  rotationNumber: /** @type {HTMLInputElement} */ (byId('inspector-rotation')),
  blurRange: /** @type {HTMLInputElement} */ (byId('inspector-blur-range')),
  blurNumber: /** @type {HTMLInputElement} */ (byId('inspector-blur')),
  crop: {
    top: /** @type {HTMLInputElement} */ (byId('inspector-crop-top')),
    right: /** @type {HTMLInputElement} */ (byId('inspector-crop-right')),
    bottom: /** @type {HTMLInputElement} */ (byId('inspector-crop-bottom')),
    left: /** @type {HTMLInputElement} */ (byId('inspector-crop-left')),
  },
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
});

/** The elements of the view aids (zoom, snap, grid, rulers, safe area). @param {ById} byId */
export const viewAidsElements = (byId) => ({
  zoomOut: /** @type {HTMLButtonElement} */ (byId('view-zoom-out')),
  zoomIn: /** @type {HTMLButtonElement} */ (byId('view-zoom-in')),
  zoomLabel: /** @type {HTMLButtonElement} */ (byId('view-zoom-label')),
  zoom100: /** @type {HTMLButtonElement} */ (byId('view-zoom-100')),
  snap: /** @type {HTMLButtonElement} */ (byId('view-snap')),
  grid: /** @type {HTMLButtonElement} */ (byId('view-grid')),
  rulers: /** @type {HTMLButtonElement} */ (byId('view-rulers')),
  safe: /** @type {HTMLButtonElement} */ (byId('view-safe')),
});

/** The elements of the publication bar and the changes dialog. @param {ById} byId */
export const publicationElements = (byId) => ({
  changes: /** @type {HTMLButtonElement} */ (byId('publish-changes')),
  compare: /** @type {HTMLButtonElement} */ (byId('publish-compare')),
  test: /** @type {HTMLButtonElement} */ (byId('publish-test')),
  dialog: /** @type {HTMLDialogElement} */ (byId('changes-dialog')),
  summary: byId('changes-summary'),
  list: byId('changes-list'),
  send: /** @type {HTMLButtonElement} */ (byId('changes-send')),
  close: /** @type {HTMLButtonElement} */ (byId('changes-close')),
});

/** The elements of the edit history dialog. @param {ById} byId */
export const editHistoryElements = (byId) => ({
  dialog: /** @type {HTMLDialogElement} */ (byId('edits-dialog')),
  list: byId('edits-list'),
  summary: byId('edits-summary'),
  close: /** @type {HTMLButtonElement} */ (byId('edits-close')),
  open: /** @type {HTMLButtonElement} */ (byId('layers-history')),
});

/** The elements of the templates dialog. @param {ById} byId */
export const templatesElements = (byId) => ({
  dialog: /** @type {HTMLDialogElement} */ (byId('templates-dialog')),
  name: /** @type {HTMLInputElement} */ (byId('templates-name')),
  save: /** @type {HTMLButtonElement} */ (byId('templates-save')),
  error: byId('templates-error'),
  list: byId('templates-list'),
  empty: byId('templates-empty'),
  close: /** @type {HTMLButtonElement} */ (byId('templates-close')),
  search: /** @type {HTMLInputElement} */ (byId('templates-search')),
  library: byId('templates-library'),
  libraryEmpty: byId('templates-library-empty'),
});

/** The elements of the OBS view pane. @param {ById} byId */
export const obsViewElements = (byId) => ({
  button: /** @type {HTMLButtonElement} */ (byId('view-obs')),
  pane: byId('obs-pane'),
  frame: /** @type {HTMLIFrameElement} */ (byId('obs-frame')),
  status: byId('obs-status'),
  close: /** @type {HTMLButtonElement} */ (byId('obs-close')),
});

/** The elements of the custom commands dialog and the macro bar. @param {ById} byId */
export const customCommandsElements = (byId) => ({
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
});

/** The elements of the preset lists and the import review. @param {ById} byId */
export const presetsElements = (byId) => ({
  list: byId('preset-list'),
  builtinList: byId('builtin-list'),
  name: /** @type {HTMLInputElement} */ (byId('preset-name')),
  tags: /** @type {HTMLInputElement} */ (byId('preset-tags')),
  search: /** @type {HTMLInputElement} */ (byId('preset-search')),
  exportButton: /** @type {HTMLButtonElement} */ (byId('preset-export')),
  importTrigger: /** @type {HTMLButtonElement} */ (byId('preset-import-trigger')),
  importInput: /** @type {HTMLInputElement} */ (byId('preset-import')),
  importReview: byId('preset-import-review'),
  importSummary: byId('preset-import-summary'),
  importDetails: byId('preset-import-details'),
  importConfirm: /** @type {HTMLButtonElement} */ (byId('preset-import-confirm')),
  importCancel: /** @type {HTMLButtonElement} */ (byId('preset-import-cancel')),
  importCode: byId('preset-import-code'),
  importCodeText: byId('preset-import-code-text'),
  importCodeAck: /** @type {HTMLInputElement} */ (byId('preset-import-code-ack')),
  save: /** @type {HTMLButtonElement} */ (byId('preset-save')),
  createNew: /** @type {HTMLButtonElement} */ (byId('preset-new')),
});
