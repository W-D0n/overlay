// @ts-check
/**
 * dev/layers-panel-controller.js — Le panneau de couches du Studio : la pile de la scène brouillon, commandée à la souris
 * et au clavier.
 *
 * Il ne détient rien : l'état est celui du document (`studio-document.js`) et chaque geste est une commande de l'éditeur
 * (`scene-editor.js`), donc annulable. Les lignes sont réconciliées en place (jamais reconstruites à chaque réglage) :
 * un champ de renommage en cours, le focus et les vignettes survivent aux changements de la scène.
 *
 * Gestes : clic (remplace la sélection), Ctrl/Cmd+clic (bascule), Maj+clic (plage), double-clic sur le nom ou F2
 * (renommer), œil et cadenas sur la ligne, barre d'outils de la sélection (isoler, dupliquer, supprimer, monter, descendre),
 * glisser-déposer pour réordonner (et pour ranger dans un groupe ou en sortir), flèches (sélection ; gauche et droite replient et déplient un groupe), Alt+flèches (réordonner),
 * grouper et dégrouper (barre d'outils, Ctrl+G, Ctrl+Maj+G),
 * Suppr, Ctrl+D (dupliquer), Ctrl+A, Ctrl+Z / Ctrl+Maj+Z / Ctrl+Y (annuler, rétablir, partout dans le Studio hors champ de saisie).
 *
 * @typedef {import('../scene-doc.js').SceneDoc} SceneDoc
 * @typedef {import('../scene-doc.js').Layer} Layer
 */
import { MAX_GROUPS, isGroup, selectionRoots, withMembers } from '../layer-group.js';
import { isGroupKind, isIdentityKind, isPhotographable } from '../layer-kinds.js';
import { createPresetThumbnail } from './preset-thumbnail.js';
import { icon, setIcon } from './icons.js';
import { aloneScene, dropTarget, layerRows, loadGauge } from './layers-panel-view.js';
import { historyKeyAction, listKeyAction } from './layers-list-keys.js';
import { createLayerGalleryController } from './layer-gallery-controller.js';

const ROW_THUMBNAIL_WIDTH = 56;
/** Une vignette n'est refaite qu'après ce délai sans réglage : un curseur ne la redessine pas à chaque cran. */
const THUMBNAIL_DEBOUNCE_MS = 450;

/**
 * @param {{
 *   elements: {
 *     list: HTMLElement,
 *     empty: HTMLElement,
 *     gauge: HTMLElement,
 *     gaugeFill: HTMLElement,
 *     gaugeHint: HTMLElement,
 *     undo: HTMLButtonElement,
 *     redo: HTMLButtonElement,
 *     add: HTMLButtonElement,
 *     solo: HTMLButtonElement,
 *     duplicate: HTMLButtonElement,
 *     group: HTMLButtonElement,
 *     ungroup: HTMLButtonElement,
 *     remove: HTMLButtonElement,
 *     up: HTMLButtonElement,
 *     down: HTMLButtonElement,
 *     gallery: HTMLDialogElement,
 *     galleryGrid: HTMLElement,
 *     galleryStatus: HTMLElement,
 *     galleryClose: HTMLButtonElement,
 *   },
 *   studio: ReturnType<typeof import('./studio-document.js').createStudioDocument>,
 *   labelOf: (kind: string) => string,
 *   addableKinds: readonly string[],
 *   pickImage?: () => void,
 *   defaultOptions: (kind: string) => Record<string, unknown>,
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   onContextMenu?: (x: number, y: number) => void,
 *   documentRef?: Document,
 *   windowRef?: Window,
 * }} input
 */
export function createLayersPanelController(input) {
  const documentRef = input.documentRef ?? document;
  const windowRef = input.windowRef ?? window;
  const { elements, studio, labelOf } = input;
  const { editor } = studio;

  /**
   * @typedef {{
   *   el: HTMLLIElement,
   *   title: HTMLElement,
   *   sub: HTMLElement,
   *   thumb: HTMLElement,
   *   buttons: Record<string, HTMLButtonElement>,
   *   signature: string,
   *   thumbTimer: ReturnType<typeof setTimeout> | null,
   *   thumbnail: { el: HTMLElement, destroy: () => void } | null,
   * }} RowParts
   */
  /** @type {Map<string, RowParts>} */
  const rows = new Map();
  /** Dernière ligne cliquée : l'ancre des sélections par plage. */
  let anchorId = /** @type {string | null} */ (null);
  /** Couches en train d'être glissées. */
  let dragIds = /** @type {string[]} */ ([]);
  let renaming = /** @type {string | null} */ (null);
  /** The groups shown collapsed: a view state, never written in the scene. @type {Set<string>} */
  const collapsed = new Set();

  /** @param {{ ok: boolean, message?: string }} result */
  function settle(result) {
    if (!result.ok && result.message !== undefined) input.report.error(result.message);
    return result.ok;
  }

  /** Les couches qu'un geste sur une ligne vise : toute la sélection si la ligne en fait partie, sinon elle seule. @param {string} id */
  function targetsOf(id) {
    const { selection } = editor.state();
    return selection.includes(id) ? [...selection] : [id];
  }

  // ── Construction d'une ligne ────────────────────────────────────────────

  /**
   * @param {string} name
   * @param {string} label
   * @param {import('./icons.js').IconName} iconName
   */
  function actionButton(name, label, iconName) {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = `layer-button layer-${name}`;
    button.dataset.action = name;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = icon(iconName);
    return button;
  }

  /** @param {string} id @returns {RowParts} */
  function createRow(id) {
    const el = documentRef.createElement('li');
    el.className = 'layer-row';
    el.dataset.id = id;
    el.draggable = true;
    el.setAttribute('role', 'option');

    const grip = documentRef.createElement('span');
    grip.className = 'layer-grip';
    grip.innerHTML = icon('grip');

    const buttons = {
      fold: actionButton('fold', 'Replier ou déplier le groupe', 'chevron-down'),
      visible: actionButton('visible', 'Afficher ou masquer', 'eye'),
      lock: actionButton('lock', 'Verrouiller ou déverrouiller', 'lock'),
    };

    const thumb = documentRef.createElement('span');
    thumb.className = 'layer-thumb';
    const text = documentRef.createElement('span');
    text.className = 'layer-text';
    const title = documentRef.createElement('span');
    title.className = 'layer-title';
    const sub = documentRef.createElement('span');
    sub.className = 'layer-sub';
    text.append(title, sub);

    const toggles = documentRef.createElement('span');
    toggles.className = 'layer-toggles';
    toggles.append(buttons.visible, buttons.lock);

    el.append(buttons.fold, grip, thumb, text, toggles);
    return { el, title, sub, thumb, buttons, signature: '', thumbTimer: null, thumbnail: null };
  }

  /** @param {RowParts} parts */
  function disposeThumbnail(parts) {
    if (parts.thumbTimer !== null) windowRef.clearTimeout(parts.thumbTimer);
    parts.thumbTimer = null;
    parts.thumbnail?.destroy();
    parts.thumbnail = null;
  }

  /**
   * La vignette de la couche, refaite (après un court délai) quand son effet ou ses options changent.
   * @param {RowParts} parts
   * @param {Layer} layer
   */
  function syncThumbnail(parts, layer) {
    if (isIdentityKind(layer.kind) || isGroupKind(layer.kind) || !isPhotographable(layer.kind)) {
      const sign = isIdentityKind(layer.kind) ? 'identity' : `pictogram|${layer.kind}`;
      if (parts.signature !== sign) {
        disposeThumbnail(parts);
        parts.thumb.innerHTML = icon(isIdentityKind(layer.kind) ? 'type' : isGroupKind(layer.kind) ? 'group' : 'code');
        parts.thumb.classList.add('layer-thumb-identity');
        parts.signature = sign;
      }
      return;
    }
    const signature = `${layer.kind}|${JSON.stringify(layer.options)}`;
    if (signature === parts.signature) return;
    const first = parts.signature === '';
    parts.signature = signature;
    parts.thumb.classList.remove('layer-thumb-identity');
    if (parts.thumbTimer !== null) windowRef.clearTimeout(parts.thumbTimer);
    const build = () => {
      parts.thumbTimer = null;
      parts.thumbnail?.destroy();
      parts.thumb.replaceChildren();
      parts.thumbnail = createPresetThumbnail({ scene: aloneScene(layer), documentRef, width: ROW_THUMBNAIL_WIDTH });
      parts.thumb.appendChild(parts.thumbnail.el);
    };
    if (first) build();
    else parts.thumbTimer = windowRef.setTimeout(build, THUMBNAIL_DEBOUNCE_MS);
  }

  // ── Rendu ───────────────────────────────────────────────────────────────

  function render() {
    const { scene } = studio.state();
    const es = editor.state();
    const view = layerRows(scene, { selection: es.selection, solo: es.solo, labelOf, collapsed });
    const byId = new Map(scene.layers.map((layer) => [layer.id, layer]));
    // A collapsed group has no rows for its members; a group that is gone is no longer collapsed.
    for (const id of collapsed) if (!byId.has(id)) collapsed.delete(id);
    const shown = new Set(view.map((row) => row.id));

    for (const [id, parts] of rows) {
      if (shown.has(id)) continue;
      disposeThumbnail(parts);
      parts.el.remove();
      rows.delete(id);
    }

    let cursor = /** @type {ChildNode | null} */ (elements.list.firstChild);
    for (const row of view) {
      let parts = rows.get(row.id);
      if (parts === undefined) {
        parts = createRow(row.id);
        rows.set(row.id, parts);
      }
      if (parts.el === cursor) cursor = cursor.nextSibling;
      else elements.list.insertBefore(parts.el, cursor);
      paintRow(parts, row, /** @type {Layer} */ (byId.get(row.id)));
    }

    elements.empty.hidden = view.length > 0;
    const gauge = loadGauge(scene);
    elements.gauge.textContent = gauge.label;
    elements.gauge.dataset.level = gauge.level;
    elements.gaugeFill.style.width = `${Math.round((gauge.count / gauge.max) * 100)}%`;
    elements.gaugeFill.dataset.level = gauge.level;
    elements.gaugeHint.textContent = gauge.hint;
    elements.add.disabled = gauge.level === 'full';

    elements.undo.disabled = !es.canUndo;
    elements.undo.title = es.undoLabel === null ? 'Rien à annuler' : `Annuler : ${es.undoLabel} (Ctrl+Z)`;
    elements.redo.disabled = !es.canRedo;
    elements.redo.title = es.redoLabel === null ? 'Rien à rétablir' : `Rétablir : ${es.redoLabel} (Ctrl+Maj+Z)`;

    // La barre d'outils agit sur la sélection : elle n'est active que s'il y en a une (dupliquer : pas le branding, qui est unique).
    const selected = scene.layers.filter((layer) => es.selection.includes(layer.id));
    const none = selected.length === 0;
    elements.solo.disabled = none;
    elements.solo.setAttribute('aria-pressed', String(es.solo !== null && es.selection.includes(es.solo)));
    elements.solo.classList.toggle('is-on', es.solo !== null);
    // A copy of a group brings its members: they are what counts against the load guard.
    const roots = selectionRoots(scene.layers, es.selection);
    const copied = withMembers(scene.layers, roots).filter((id) => !isGroup(/** @type {Layer} */ (byId.get(id)))).length;
    const groupCount = scene.layers.filter(isGroup).length;
    const copiedGroups = roots.filter((id) => isGroup(/** @type {Layer} */ (byId.get(id)))).length;
    elements.duplicate.disabled = none || selected.some((layer) => isIdentityKind(layer.kind)) || gauge.count + copied > gauge.max || groupCount + copiedGroups > MAX_GROUPS;
    elements.group.disabled = none || selected.some((layer) => isGroup(layer) || isIdentityKind(layer.kind)) || groupCount >= MAX_GROUPS;
    elements.ungroup.disabled = !selected.some((layer) => isGroup(layer) || layer.group !== undefined);
    elements.remove.disabled = none;
    elements.up.disabled = none;
    elements.down.disabled = none;

    gallery.sync(scene);
  }

  /**
   * @param {RowParts} parts
   * @param {import('./layers-panel-view.js').LayerRow} row
   * @param {Layer} layer
   */
  function paintRow(parts, row, layer) {
    const { el } = parts;
    el.classList.toggle('is-selected', row.selected);
    el.classList.toggle('is-hidden', !row.visible);
    el.classList.toggle('is-locked', row.locked);
    el.classList.toggle('is-dimmed', row.dimmed);
    el.classList.toggle('is-identity', row.identity);
    el.classList.toggle('is-group', row.group);
    el.classList.toggle('is-inherited', row.hiddenByGroup || row.lockedByGroup);
    el.dataset.depth = String(row.depth);
    el.setAttribute('aria-selected', String(row.selected));
    if (row.group) el.setAttribute('aria-expanded', String(!row.collapsed));
    else el.removeAttribute('aria-expanded');
    setIcon(parts.buttons.fold, row.collapsed ? 'chevron-right' : 'chevron-down');
    parts.buttons.fold.setAttribute('aria-expanded', String(!row.collapsed));
    parts.buttons.fold.tabIndex = -1;
    el.draggable = renaming !== row.id;
    if (renaming !== row.id) parts.title.textContent = row.title;
    parts.sub.textContent = row.subtitle;
    parts.sub.hidden = row.subtitle === '';

    setIcon(parts.buttons.visible, row.visible ? 'eye' : 'eye-off');
    parts.buttons.visible.setAttribute('aria-pressed', String(!row.visible));
    setIcon(parts.buttons.lock, row.locked ? 'lock' : 'unlock');
    parts.buttons.lock.setAttribute('aria-pressed', String(row.locked));
    syncThumbnail(parts, layer);
  }

  // ── Gestes ──────────────────────────────────────────────────────────────

  /** L'œil et le cadenas d'une ligne : toute la sélection si la ligne en fait partie. @param {string} id @param {string} action */
  function runAction(id, action) {
    if (action === 'fold') {
      if (collapsed.has(id)) collapsed.delete(id);
      else collapsed.add(id);
      render();
      return;
    }
    const ids = targetsOf(id);
    const first = studio.state().scene.layers.find((layer) => layer.id === id);
    if (first === undefined) return;
    if (action === 'visible') settle(editor.setLayers(ids, { visible: !first.visible }));
    else if (action === 'lock') settle(editor.setLayers(ids, { locked: first.locked !== true }));
  }

  /** @param {MouseEvent} event @param {string} id */
  function selectFromClick(event, id) {
    const displayed = [...elements.list.children].map((node) => /** @type {HTMLElement} */ (node).dataset.id ?? '');
    if (event.shiftKey && anchorId !== null && displayed.includes(anchorId)) {
      const [from, to] = [displayed.indexOf(anchorId), displayed.indexOf(id)].sort((a, b) => a - b);
      editor.select(displayed.slice(from, to + 1), event.ctrlKey || event.metaKey ? 'add' : 'replace');
    } else if (event.ctrlKey || event.metaKey) {
      editor.select([id], 'toggle');
      anchorId = id;
    } else {
      editor.select([id]);
      anchorId = id;
    }
  }

  /** @param {string} id */
  function startRename(id) {
    const parts = rows.get(id);
    if (parts === undefined || renaming !== null) return;
    renaming = id;
    parts.el.draggable = false;
    const layer = studio.state().scene.layers.find((candidate) => candidate.id === id);
    const field = documentRef.createElement('input');
    field.type = 'text';
    field.className = 'layer-rename';
    field.maxLength = 40;
    field.value = layer?.name ?? labelOf(layer?.kind ?? '');
    field.setAttribute('aria-label', 'Nom de la couche');
    let settled = false;
    const finish = (/** @type {boolean} */ commit) => {
      if (settled) return;
      settled = true;
      renaming = null;
      const next = field.value.trim();
      field.remove();
      parts.title.hidden = false;
      if (commit && layer !== undefined && next !== (layer.name ?? '') && next !== labelOf(layer.kind)) settle(editor.setLayers([id], { name: next }));
      render();
    };
    field.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') finish(true);
      else if (event.key === 'Escape') finish(false);
    });
    field.addEventListener('blur', () => finish(true));
    parts.title.hidden = true;
    parts.title.after(field);
    field.focus();
    field.select();
  }

  elements.list.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const rowEl = target.closest('.layer-row');
    if (rowEl === null) return;
    const id = /** @type {HTMLElement} */ (rowEl).dataset.id ?? '';
    const button = /** @type {HTMLElement | null} */ (target.closest('[data-action]'));
    if (button !== null) {
      runAction(id, button.dataset.action ?? '');
      return;
    }
    if (target.closest('.layer-rename') !== null) return;
    selectFromClick(/** @type {MouseEvent} */ (event), id);
  });

  elements.list.addEventListener('contextmenu', (event) => {
    const row = /** @type {HTMLElement | null} */ ((/** @type {HTMLElement} */ (event.target)).closest('.layer-row'));
    if (row === null) return;
    event.preventDefault();
    const id = row.dataset.id ?? '';
    if (!editor.state().selection.includes(id)) editor.select([id]);
    input.onContextMenu?.(event.clientX, event.clientY);
  });

  elements.list.addEventListener('dblclick', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.closest('.layer-title') === null) return;
    const id = /** @type {HTMLElement} */ (target.closest('.layer-row')).dataset.id ?? '';
    startRename(id);
  });

  // Glisser-déposer : le bord haut ou bas de la ligne survolée dit où la pile sera insérée.
  /** @param {DragEvent} event @returns {{ id: string, edge: 'top' | 'bottom', row: HTMLElement } | null} */
  function rowUnderPointer(event) {
    const row = /** @type {HTMLElement | null} */ ((/** @type {HTMLElement} */ (event.target)).closest('.layer-row'));
    if (row === null) return null;
    const rect = row.getBoundingClientRect();
    return { id: row.dataset.id ?? '', edge: event.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom', row };
  }

  function clearDropMarks() {
    for (const parts of rows.values()) parts.el.classList.remove('drop-top', 'drop-bottom', 'drop-into');
  }

  elements.list.addEventListener('dragstart', (event) => {
    const row = /** @type {HTMLElement | null} */ ((/** @type {HTMLElement} */ (event.target)).closest('.layer-row'));
    if (row === null) return;
    const id = row.dataset.id ?? '';
    if (!editor.state().selection.includes(id)) editor.select([id]);
    dragIds = [...editor.state().selection];
    event.dataTransfer?.setData('text/plain', dragIds.join(','));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  elements.list.addEventListener('dragover', (event) => {
    const hit = rowUnderPointer(event);
    clearDropMarks();
    if (hit === null || dragIds.length === 0) return;
    const target = dropTarget(studio.state().scene, dragIds, hit.id, hit.edge, collapsed);
    if (target === null) {
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    // Into a group: the whole row is marked; beside a layer: the edge it is dropped on.
    hit.row.classList.add('into' in target ? 'drop-into' : hit.edge === 'top' ? 'drop-top' : 'drop-bottom');
  });
  elements.list.addEventListener('dragleave', (event) => {
    if (!elements.list.contains(/** @type {Node | null} */ (event.relatedTarget))) clearDropMarks();
  });
  elements.list.addEventListener('drop', (event) => {
    event.preventDefault();
    const hit = rowUnderPointer(event);
    clearDropMarks();
    if (hit === null) return;
    const target = dropTarget(studio.state().scene, dragIds, hit.id, hit.edge, collapsed);
    if (target !== null) settle(editor.moveLayersTo(dragIds, target));
    dragIds = [];
  });
  elements.list.addEventListener('dragend', () => {
    clearDropMarks();
    dragIds = [];
  });

  // Clavier dans la liste.
  elements.list.tabIndex = 0;
  elements.list.addEventListener('keydown', (event) => {
    const { selection } = editor.state();
    const last = selection.length === 0 ? null : selection[selection.length - 1];
    const lastLayer = last === null ? undefined : studio.state().scene.layers.find((layer) => layer.id === last);
    const displayed = [...elements.list.children].map((node) => /** @type {HTMLElement} */ (node).dataset.id ?? '');
    const action = listKeyAction(event, { displayed, selection, lastIsGroup: lastLayer !== undefined && isGroup(lastLayer) });
    if (action === null) return;
    event.preventDefault();
    switch (action.type) {
      case 'move': settle(editor.moveLayers(selection, action.direction)); break;
      case 'select': editor.select([action.id], action.add ? 'add' : 'replace'); anchorId = action.id; break;
      case 'fold': foldGroup(/** @type {string} */ (last), action.folded); break;
      case 'remove': settle(editor.removeLayers(selection)); break;
      case 'rename': startRename(/** @type {string} */ (last)); break;
      case 'duplicate': settle(editor.duplicateLayers(selection)); break;
      case 'select-all': editor.selectAll(); break;
      default: break;
    }
  });

  /** @param {string} id @param {boolean} folded */
  function foldGroup(id, folded) {
    if (folded) collapsed.add(id);
    else collapsed.delete(id);
    render();
  }

  // Barre d'outils de la sélection.
  elements.solo.addEventListener('click', () => {
    const { selection, solo } = editor.state();
    const primary = selection[selection.length - 1];
    if (primary !== undefined) editor.setSolo(solo === primary ? null : primary);
  });
  elements.duplicate.addEventListener('click', () => { settle(editor.duplicateLayers(editor.state().selection)); });
  elements.group.addEventListener('click', () => { settle(editor.groupLayers(editor.state().selection)); });
  elements.ungroup.addEventListener('click', () => { settle(editor.ungroupLayers(editor.state().selection)); });
  elements.remove.addEventListener('click', () => { settle(editor.removeLayers(editor.state().selection)); });
  elements.up.addEventListener('click', () => { settle(editor.moveLayers(editor.state().selection, 'up')); });
  elements.down.addEventListener('click', () => { settle(editor.moveLayers(editor.state().selection, 'down')); });

  // Annuler / rétablir : boutons, et clavier partout dans le Studio sauf dans un champ de saisie (qui garde le sien).
  elements.undo.addEventListener('click', () => { settle(editor.undo()); });
  elements.redo.addEventListener('click', () => { settle(editor.redo()); });

  /** @param {EventTarget | null} target */
  function isTyping(target) {
    const el = /** @type {HTMLElement | null} */ (target);
    return el !== null && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
  }
  /** @param {KeyboardEvent} event */
  function onShortcut(event) {
    const action = historyKeyAction(event, isTyping(event.target));
    if (action === null) return;
    event.preventDefault();
    if (action === 'undo') editor.undo();
    else editor.redo();
  }
  documentRef.addEventListener('keydown', onShortcut);

  const gallery = createLayerGalleryController({
    elements: { open: elements.add, dialog: elements.gallery, grid: elements.galleryGrid, status: elements.galleryStatus, close: elements.galleryClose },
    editor,
    labelOf,
    addableKinds: input.addableKinds,
    defaultOptions: input.defaultOptions,
    ...(input.pickImage === undefined ? {} : { pickImage: input.pickImage }),
    documentRef,
  });

  elements.solo.innerHTML = icon('solo');
  elements.duplicate.innerHTML = icon('copy');
  elements.group.innerHTML = icon('group');
  elements.ungroup.innerHTML = icon('ungroup');
  elements.remove.innerHTML = icon('trash');
  elements.up.innerHTML = icon('arrow-up');
  elements.down.innerHTML = icon('arrow-down');
  elements.undo.innerHTML = icon('undo');
  elements.redo.innerHTML = icon('redo');

  studio.subscribe(render);
  render();

  return {
    render,
    startRename,
    destroy() {
      documentRef.removeEventListener('keydown', onShortcut);
      for (const parts of rows.values()) disposeThumbnail(parts);
      gallery.destroy();
    },
  };
}
