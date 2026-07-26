// @ts-check
import { brandingStyles, hasBrandingContent, normalizeBranding } from '../branding-format.js';

/**
 * components/BrandingLayer.js — Pseudo et réseaux posés au-dessus du fond.
 *
 * DOM pur, pas de canvas : c'est du texte, il doit rester net et sélectionnable par OBS comme du
 * texte. Contrat volontairement différent d'un effet de fond (`update(branding)`, pas d'options
 * d'effet, pas de réaction audio, pas de transition).
 * Voir docs/specs/background-branding-layer.md.
 */

/**
 * Canvas de conception : les tailles réglées dans le tuner valent pour cette hauteur, et le bloc
 * entier est mis à l'échelle du canvas réel. Sans ça, une taille pensée ici paraîtrait plus petite
 * sur un canvas plus grand (LAC-01 de la spec, résolue le 2026-07-26).
 */
export const BRANDING_REFERENCE_HEIGHT = 1440;

/** @param {number} height */
export function brandingScale(height) {
  return Number.isFinite(height) && height > 0 ? height / BRANDING_REFERENCE_HEIGHT : 1;
}

/**
 * @param {unknown} [initialBranding]
 * @returns {{ el: HTMLElement, update: (branding: unknown) => void, destroy: () => void }}
 */
export function BrandingLayer(initialBranding) {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';

  const block = document.createElement('div');
  block.style.cssText = 'position:absolute;white-space:pre;';
  el.appendChild(block);

  const name = document.createElement('div');
  name.style.cssText = `font-family:var(--font-serif);line-height:1.1;`;
  const lines = document.createElement('div');
  lines.style.cssText = 'font-family:var(--font-mono);line-height:1.5;margin-top:0.35em;';

  /** @type {ResizeObserver | null} */
  let observer = null;
  let current = normalizeBranding(initialBranding);

  function applyScale() {
    const scale = brandingScale(el.clientHeight);
    const alignRight = current.x > 50;
    const alignBottom = current.y > 50;
    // L'origine suit l'alignement : le bloc grandit vers l'intérieur du canvas, jamais hors champ.
    block.style.transformOrigin = `${alignRight ? 'right' : 'left'} ${alignBottom ? 'bottom' : 'top'}`;
    block.style.transform = `${brandingStyles(current).transform} scale(${scale})`;
  }

  function render() {
    const styles = brandingStyles(current);
    block.style.left = styles.left;
    block.style.top = styles.top;
    block.style.textAlign = styles.textAlign;
    block.style.color = styles.color;
    block.style.opacity = styles.opacity;

    block.replaceChildren();
    if (!hasBrandingContent(current)) return;

    if (current.name.trim().length > 0) {
      name.textContent = current.name;
      name.style.fontSize = `${current.nameSize}px`;
      block.appendChild(name);
    }
    if (current.lines.length > 0) {
      lines.replaceChildren();
      lines.style.fontSize = `${current.lineSize}px`;
      for (const line of current.lines) {
        const row = document.createElement('div');
        // textContent, jamais innerHTML : un pseudo contenant du balisage reste du texte.
        row.textContent = line;
        lines.appendChild(row);
      }
      block.appendChild(lines);
    }
    applyScale();
  }

  render();
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(applyScale);
    observer.observe(el);
  }

  return {
    el,
    update(branding) {
      current = normalizeBranding(branding);
      render();
    },
    destroy() {
      observer?.disconnect();
      observer = null;
      el.remove();
    },
  };
}
