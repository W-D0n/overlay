// @ts-check
import { createBackgroundMount } from '../background-mount.js';
import { createThumbnailQueue } from './thumbnail-queue.js';

/**
 * dev/preset-thumbnail.js — Vignette d'un preset dans la liste du Studio.
 *
 * L'effet réel est monté dans une boîte de la taille d'une vignette, photographié après un court
 * échauffement, puis démonté : au repos, une vignette ne coûte rien. Le survol relance l'effet pour
 * montrer le mouvement, qui est souvent ce qui distingue deux ambiances.
 * Voir docs/specs/background-preset-thumbnails.md.
 */

/** 16:9 comme le canvas OBS — une vignette d'un autre rapport mentirait sur le cadrage. */
export const THUMBNAIL_WIDTH = 104;
export const THUMBNAIL_HEIGHT = 58;

/**
 * Certains effets peignent rarement (une goutte toutes les deux secondes pour WaterRipple, des
 * étoiles très pâles pour StarsParallax) : une photo trop précoce donnait une vignette noire.
 * On réessaie jusqu'à trouver une image qui contient réellement quelque chose.
 */
const WARMUP_MS = 500;
const MAX_ATTEMPTS = 4;
/** Part minimale de pixels peints pour considérer la vignette représentative. */
const MIN_INK_RATIO = 0.002;

const queue = createThumbnailQueue();

/**
 * Part de pixels non transparents. Sur une vignette de 104×58, la lecture coûte quelques
 * microsecondes — négligeable face au montage de l'effet.
 * @param {HTMLCanvasElement} canvas
 * @returns {number}
 */
export function canvasInkRatio(canvas) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null || canvas.width === 0 || canvas.height === 0) return 0;
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let painted = 0;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > 8) painted += 1;
  }
  return painted / (data.length / 4);
}

/**
 * @param {{
 *   preset: { component: string, options: Record<string, unknown> },
 *   documentRef: Document,
 *   delay?: (ms: number) => Promise<void>,
 * }} input
 * @returns {{ el: HTMLElement, destroy: () => void }}
 */
export function createPresetThumbnail(input) {
  const { documentRef } = input;
  const delay = input.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  const el = documentRef.createElement('div');
  el.className = 'preset-thumb';
  el.style.width = `${THUMBNAIL_WIDTH}px`;
  el.style.height = `${THUMBNAIL_HEIGHT}px`;

  const still = documentRef.createElement('img');
  still.alt = '';
  still.className = 'preset-thumb-still';
  el.appendChild(still);

  const stage = documentRef.createElement('div');
  stage.className = 'preset-thumb-stage';
  el.appendChild(stage);

  /** @type {ReturnType<typeof createBackgroundMount> | null} */
  let liveMount = null;
  let destroyed = false;

  function unmountLive() {
    liveMount?.destroy();
    liveMount = null;
    el.dataset.live = 'false';
  }

  function mountLive() {
    if (destroyed || liveMount !== null) return;
    liveMount = createBackgroundMount(stage);
    liveMount.apply({ component: input.preset.component, options: input.preset.options });
    el.dataset.live = 'true';
  }

  queue.push(async () => {
    if (destroyed) return;
    const mount = createBackgroundMount(stage);
    mount.apply({ component: input.preset.component, options: input.preset.options });

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await delay(WARMUP_MS);
      if (destroyed) break;

      const canvas = /** @type {HTMLCanvasElement | null} */ (stage.querySelector('canvas'));
      // Un effet sans canvas laisse simplement la vignette vide : pas d'erreur, la ligne reste
      // lisible par son nom.
      if (canvas === null || typeof canvas.toDataURL !== 'function') break;

      const ink = canvasInkRatio(canvas);
      const lastChance = attempt === MAX_ATTEMPTS - 1;
      if (ink >= MIN_INK_RATIO || lastChance) {
        still.src = canvas.toDataURL('image/webp', 0.7);
        break;
      }
    }
    mount.destroy();
  });

  el.addEventListener('pointerenter', mountLive);
  el.addEventListener('pointerleave', unmountLive);
  el.addEventListener('focusin', mountLive);
  el.addEventListener('focusout', unmountLive);

  return {
    el,
    destroy() {
      destroyed = true;
      unmountLive();
      el.remove();
    },
  };
}
