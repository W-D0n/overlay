// @ts-check
/**
 * dev/layer-gallery-controller.js — The gallery that adds a layer: one card per addable type, with its preview, and a click adds the layer (the image is chosen in the media library).
 *
 * It holds nothing: adding is an editor command, so it can be undone, and a refusal (limit, a second branding) is shown in the dialog.
 *
 * @typedef {import('../src/scene/scene-doc.js').SceneDoc} SceneDoc
 */
import { isIdentityKind, isPhotographable } from '../src/layers/layer-kinds.js';
import { createPresetThumbnail } from './preset-thumbnail.js';
import { icon } from './icons.js';
import { aloneScene } from './layers-panel-view.js';

const GALLERY_THUMBNAIL_WIDTH = 160;

/**
 * @param {{
 *   elements: { open: HTMLButtonElement, dialog: HTMLDialogElement, grid: HTMLElement, status: HTMLElement, close: HTMLButtonElement },
 *   editor: ReturnType<typeof import('./scene-editor.js').createSceneEditor>,
 *   labelOf: (kind: string) => string,
 *   addableKinds: readonly string[],
 *   defaultOptions: (kind: string) => Record<string, unknown>,
 *   pickImage?: () => void,
 *   createThumbnail?: typeof createPresetThumbnail,
 *   documentRef?: Document,
 * }} input
 */
export function createLayerGalleryController(input) {
  const documentRef = input.documentRef ?? document;
  const createThumbnail = input.createThumbnail ?? createPresetThumbnail;
  const { elements, editor } = input;
  /** @type {{ destroy: () => void }[]} */
  const thumbnails = [];
  /** @type {Map<string, HTMLButtonElement>} */
  const cards = new Map();

  for (const kind of input.addableKinds) {
    const card = documentRef.createElement('button');
    card.type = 'button';
    card.className = 'gallery-card';
    card.dataset.kind = kind;
    const preview = documentRef.createElement('span');
    preview.className = 'gallery-preview';
    if (isIdentityKind(kind) || !isPhotographable(kind)) {
      preview.classList.add('layer-thumb-identity');
      preview.innerHTML = icon(isIdentityKind(kind) ? 'type' : 'code');
    } else {
      const thumbnail = createThumbnail({
        scene: aloneScene({ id: 'apercu', kind: /** @type {*} */ (kind), visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: input.defaultOptions(kind) }),
        documentRef,
        width: GALLERY_THUMBNAIL_WIDTH,
      });
      thumbnails.push(thumbnail);
      preview.appendChild(thumbnail.el);
    }
    const label = documentRef.createElement('span');
    label.className = 'gallery-label';
    label.textContent = input.labelOf(kind);
    card.append(preview, label);
    card.addEventListener('click', () => {
      // An image is chosen in the media library: the gallery closes on it.
      if (kind === 'image' && input.pickImage !== undefined) {
        elements.dialog.close();
        input.pickImage();
        return;
      }
      const result = editor.addLayer({ kind, ...(isIdentityKind(kind) ? {} : { options: input.defaultOptions(kind) }) });
      if (result.ok) {
        elements.status.textContent = '';
        elements.dialog.close();
      } else {
        elements.status.textContent = result.message;
      }
    });
    cards.set(kind, card);
    elements.grid.appendChild(card);
  }

  elements.open.innerHTML = `${icon('plus')}<span>Ajouter</span>`;
  elements.open.addEventListener('click', () => {
    elements.status.textContent = '';
    if (typeof elements.dialog.showModal === 'function') elements.dialog.showModal();
    else elements.dialog.setAttribute('open', '');
  });
  elements.close.addEventListener('click', () => elements.dialog.close());

  return {
    /** An identity layer is unique: its card is disabled while the scene already has one. @param {SceneDoc} scene */
    sync(scene) {
      for (const [kind, card] of cards) card.disabled = isIdentityKind(kind) && scene.layers.some((layer) => layer.kind === kind);
    },

    destroy() {
      for (const thumbnail of thumbnails) thumbnail.destroy();
    },
  };
}
