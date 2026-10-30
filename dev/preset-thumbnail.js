// @ts-check
import { createSceneRuntime } from '../scene-runtime.js';
import { createThumbnailQueue } from './thumbnail-queue.js';
import { STAGE_HEIGHT, STAGE_WIDTH } from './preview-stage.js';

/**
 * dev/preset-thumbnail.js — Vignette d'un preset dans la liste du Studio.
 *
 * L'effet réel est monté dans une scène de la taille de la source OBS (`render-reference.js`) réduite par
 * transformation CSS, photographié après un court échauffement, puis démonté : au repos, une vignette
 * ne coûte rien. La vignette montre donc ce qu'OBS affichera, pas l'effet redessiné à petite échelle :
 * un fond discret reste discret. Le survol relance l'effet pour montrer le mouvement, qui est souvent
 * ce qui distingue deux ambiances.
 * Voir docs/specs/background-preset-thumbnails.md.
 */

/** 16:9 comme le canvas OBS — une vignette d'un autre rapport mentirait sur le cadrage. */
export const THUMBNAIL_WIDTH = 128;
export const THUMBNAIL_HEIGHT = 72;
/** La photo est prise au double de la taille affichée : nette sur un écran à densité élevée. */
const SNAPSHOT_SCALE = 2;

/**
 * Lance `capture` quand `el` devient visible. Un élément masqué (onglet du Studio non affiché) n'a pas
 * de taille : l'effet ne dimensionnerait pas son canvas et la vignette serait un canvas vide de
 * 300×150. Sans `IntersectionObserver` (tests), la capture démarre aussitôt.
 * @param {Element} el
 * @param {((callback: (entries: { isIntersecting: boolean }[]) => void) => { observe(el: Element): void, disconnect(): void }) | null} createObserver
 * @param {() => void} capture
 * @returns {() => void} annulation
 */
export function onceVisible(el, createObserver, capture) {
  if (createObserver === null) {
    capture();
    return () => {};
  }
  let captured = false;
  const observer = createObserver((entries) => {
    if (captured || !entries.some(({ isIntersecting }) => isIntersecting)) return;
    captured = true;
    observer.disconnect();
    capture();
  });
  observer.observe(el);
  return () => observer.disconnect();
}

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
 * Peint sur `target` tous les canvas de la scène montée dans `stage`, du dessous au dessus, chacun à sa place et à son
 * opacité (celle de son calque et de ses ancêtres) : la vignette d'une scène à plusieurs couches montre l'ensemble, pas
 * la seule première couche. Les couches masquées (sans taille) sont ignorées.
 * @param {HTMLElement} stage
 * @param {HTMLCanvasElement} target
 * @returns {number} nombre de canvas peints
 */
export function paintStage(stage, target) {
  const context = target.getContext('2d');
  const view = stage.ownerDocument.defaultView;
  if (context === null || view === null) return 0;
  const frame = stage.getBoundingClientRect();
  if (frame.width === 0) return 0;
  const factor = target.width / frame.width;
  let painted = 0;
  for (const canvas of stage.querySelectorAll('canvas')) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    let alpha = 1;
    for (let node = /** @type {Element | null} */ (canvas); node !== null && node !== stage; node = node.parentElement) {
      alpha *= Number.parseFloat(view.getComputedStyle(node).opacity || '1');
    }
    context.globalAlpha = alpha;
    context.drawImage(canvas, (rect.left - frame.left) * factor, (rect.top - frame.top) * factor, rect.width * factor, rect.height * factor);
    painted += 1;
  }
  context.globalAlpha = 1;
  return painted;
}

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
 *   scene: import('../scene-doc.js').SceneDoc,
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

  // Scène à la taille réelle de la source OBS, réduite à la taille de la vignette : les effets
  // dimensionnent leurs éléments pour 1080p, pas pour 128 px.
  const stage = documentRef.createElement('div');
  stage.className = 'preset-thumb-stage';
  stage.style.width = `${STAGE_WIDTH}px`;
  stage.style.height = `${STAGE_HEIGHT}px`;
  stage.style.transformOrigin = '0 0';
  stage.style.transform = `scale(${THUMBNAIL_WIDTH / STAGE_WIDTH})`;
  el.appendChild(stage);
  el.dataset.state = 'pending';

  /** @type {ReturnType<typeof createSceneRuntime> | null} */
  let liveMount = null;
  let destroyed = false;

  function unmountLive() {
    liveMount?.destroy();
    liveMount = null;
    el.dataset.live = 'false';
  }

  function mountLive() {
    if (destroyed || liveMount !== null) return;
    liveMount = createSceneRuntime(stage);
    liveMount.apply(input.scene);
    el.dataset.live = 'true';
  }

  const View = documentRef.defaultView;
  const cancelCapture = onceVisible(
    el,
    typeof View?.IntersectionObserver === 'function'
      ? (callback) => new View.IntersectionObserver(callback)
      : null,
    () => queue.push(captureStill),
  );

  async function captureStill() {
    if (destroyed) return;
    const mount = createSceneRuntime(stage);
    mount.apply(input.scene);

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await delay(WARMUP_MS);
      if (destroyed) break;

      const snapshot = documentRef.createElement('canvas');
      snapshot.width = THUMBNAIL_WIDTH * SNAPSHOT_SCALE;
      snapshot.height = THUMBNAIL_HEIGHT * SNAPSHOT_SCALE;
      // Une scène sans canvas laisse simplement la vignette vide : pas d'erreur, la ligne reste lisible par son nom.
      if (paintStage(stage, snapshot) === 0) {
        el.dataset.state = 'empty';
        break;
      }

      const lastChance = attempt === MAX_ATTEMPTS - 1;
      if (canvasInkRatio(snapshot) >= MIN_INK_RATIO || lastChance) {
        still.src = snapshot.toDataURL('image/webp', 0.8);
        el.dataset.state = 'ready';
        break;
      }
    }
    mount.destroy();
  }

  el.addEventListener('pointerenter', mountLive);
  el.addEventListener('pointerleave', unmountLive);
  el.addEventListener('focusin', mountLive);
  el.addEventListener('focusout', unmountLive);

  return {
    el,
    destroy() {
      destroyed = true;
      cancelCapture();
      unmountLive();
      el.remove();
    },
  };
}
