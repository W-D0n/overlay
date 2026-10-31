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
  // La scène est réduite par transformation CSS : les tailles de mise en page (`offset*`) restent celles de la source.
  const shrink = stage.offsetWidth > 0 ? frame.width / stage.offsetWidth : 1;
  let painted = 0;
  for (const canvas of stage.querySelectorAll('canvas')) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    /** @type {CSSStyleDeclaration[]} */
    const chain = [];
    for (let node = /** @type {Element | null} */ (canvas); node !== null && node !== stage; node = node.parentElement) {
      chain.push(view.getComputedStyle(node));
    }
    const look = lookOfStyles(chain);
    context.globalAlpha = look.alpha;
    if (!look.extended) {
      context.drawImage(canvas, (rect.left - frame.left) * factor, (rect.top - frame.top) * factor, rect.width * factor, rect.height * factor);
    } else {
      // Une rotation autour du centre garde le centre du cadre englobant : on repart de lui et de la taille de mise en page.
      const width = canvas.offsetWidth * shrink * factor;
      const height = canvas.offsetHeight * shrink * factor;
      context.save();
      context.globalCompositeOperation = look.composite;
      context.filter = look.blurPx === 0 ? 'none' : `blur(${look.blurPx * shrink * factor}px)`;
      context.translate((rect.left - frame.left + rect.width / 2) * factor, (rect.top - frame.top + rect.height / 2) * factor);
      context.rotate(look.angle);
      if (look.inset !== null) {
        context.beginPath();
        context.rect(-width / 2 + look.inset.left * width, -height / 2 + look.inset.top * height, width * (1 - look.inset.left - look.inset.right), height * (1 - look.inset.top - look.inset.bottom));
        context.clip();
      }
      context.drawImage(canvas, -width / 2, -height / 2, width, height);
      context.restore();
    }
    painted += 1;
  }
  context.globalAlpha = 1;
  return painted;
}

/**
 * Ce que le CSS fait à un canvas depuis ses ancêtres (du canvas vers la scène), traduit pour le peindre à la main : opacité
 * cumulée, mode de fusion, angle, flou en pixels de mise en page et rognage en fractions de sa taille. Logique pure.
 * @param {readonly { opacity: string, mixBlendMode: string, transform: string, clipPath: string, filter: string }[]} styles
 * @returns {{ alpha: number, composite: GlobalCompositeOperation, angle: number, blurPx: number, inset: { top: number, right: number, bottom: number, left: number } | null, extended: boolean }}
 */
export function lookOfStyles(styles) {
  let alpha = 1;
  let angle = 0;
  let blurPx = 0;
  /** @type {GlobalCompositeOperation} */
  let composite = 'source-over';
  /** @type {{ top: number, right: number, bottom: number, left: number } | null} */
  let inset = null;
  for (const style of styles) {
    alpha *= Number.parseFloat(style.opacity || '1');
    const matrix = /^matrix\(([^)]+)\)$/.exec(style.transform ?? '');
    if (matrix !== null) {
      const [a, b] = matrix[1].split(',').map(Number);
      angle += Math.atan2(b, a);
    }
    if (style.mixBlendMode === 'multiply' || style.mixBlendMode === 'screen' || style.mixBlendMode === 'overlay') composite = style.mixBlendMode;
    const blur = /blur\(([\d.]+)px\)/.exec(style.filter ?? '');
    if (blur !== null) blurPx += Number(blur[1]);
    const clip = /^inset\(([^)]+)\)$/.exec(style.clipPath ?? '');
    if (clip !== null) {
      const [top, right = top, bottom = top, left = right] = clip[1].split(/\s+/).map((part) => Number.parseFloat(part) / 100);
      inset = { top, right, bottom, left };
    }
  }
  return { alpha, composite, angle, blurPx, inset, extended: composite !== 'source-over' || angle !== 0 || blurPx !== 0 || inset !== null };
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
 *   width?: number,
 *   delay?: (ms: number) => Promise<void>,
 * }} input
 * @returns {{ el: HTMLElement, destroy: () => void }}
 */
export function createPresetThumbnail(input) {
  const { documentRef } = input;
  const width = input.width ?? THUMBNAIL_WIDTH;
  const height = Math.round((width * THUMBNAIL_HEIGHT) / THUMBNAIL_WIDTH);
  const delay = input.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  const el = documentRef.createElement('div');
  el.className = 'preset-thumb';
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;

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
  stage.style.transform = `scale(${width / STAGE_WIDTH})`;
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
      snapshot.width = width * SNAPSHOT_SCALE;
      snapshot.height = height * SNAPSHOT_SCALE;
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
