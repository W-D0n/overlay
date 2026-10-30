// @ts-check
/**
 * dev/scrub-field.js — Régler un nombre en le « frottant » : glisser horizontalement sur l'étiquette d'un champ numérique
 * (inspecteur, réglages d'effet, transition…) change sa valeur, comme dans un logiciel de création. Au clavier, Maj + flèche
 * va dix fois plus vite, Alt + flèche dix fois plus finement (les flèches seules gardent le pas du champ).
 *
 * Le champ reste la source : le module écrit sa valeur et déclenche ses événements `input` puis `change`, si bien que tout ce
 * qui l'écoute (coalescence d'historique, aperçu en direct) fonctionne sans rien savoir du glisser. Échap pendant un glisser
 * rend la valeur d'avant.
 */

/** Pixels de glisser pour un pas du champ. */
export const PIXELS_PER_STEP = 4;
/** Sous ce déplacement, un appui sur l'étiquette reste un clic ordinaire. */
export const START_THRESHOLD = 3;

/** @param {{ shiftKey: boolean, altKey: boolean }} modifiers @returns {number} */
export function speedFactor({ shiftKey, altKey }) {
  if (shiftKey) return 10;
  if (altKey) return 0.1;
  return 1;
}

/** Le nombre de décimales d'un pas (0.5 → 1, 0.05 → 2, 1 → 0). @param {number} step */
function decimalsOf(step) {
  const text = String(step);
  if (text.includes('e-')) return Number(text.split('e-')[1]);
  return text.includes('.') ? text.split('.')[1].length : 0;
}

/**
 * La valeur après un glissement ou un coup de flèche : arrondie au pas (sans bruit de virgule flottante), bornée.
 * @param {number} start valeur au départ
 * @param {number} steps nombre de pas (fractionnaire pendant un glisser)
 * @param {{ step: number, min?: number, max?: number, factor?: number }} field
 * @returns {number}
 */
export function scrubValue(start, steps, { step, min = -Infinity, max = Infinity, factor = 1 }) {
  const unit = step > 0 && Number.isFinite(step) ? step : 1;
  const effective = unit * factor;
  const raw = start + Math.trunc(steps) * effective;
  const decimals = Math.max(decimalsOf(unit), decimalsOf(effective));
  const rounded = Number(raw.toFixed(decimals));
  return Math.min(max, Math.max(min, rounded));
}

/** La fenêtre d'un document (un document de la page en a toujours une). @param {Document} doc @returns {Window & typeof globalThis} */
function viewOf(doc) {
  if (doc.defaultView === null) throw new Error('document sans fenêtre');
  return /** @type {Window & typeof globalThis} */ (doc.defaultView);
}

/** @param {HTMLInputElement} field */
function fieldLimits(field) {
  const read = (/** @type {string} */ raw, /** @type {number} */ fallback) => {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return { step: read(field.step, 1), min: read(field.min, -Infinity), max: read(field.max, Infinity) };
}

/**
 * Le champ numérique qu'une étiquette désigne : celui qu'elle contient ou nomme (ou, si elle nomme un curseur, le champ
 * numérique qui l'accompagne), sinon celui du contrôle qui la suit.
 * @param {Element} label
 * @returns {HTMLInputElement | null}
 */
export function scrubTarget(label) {
  const labelled = /** @type {HTMLLabelElement} */ (label).control;
  if (labelled instanceof viewOf(label.ownerDocument).HTMLInputElement && labelled.type === 'number') return labelled;
  if (labelled instanceof viewOf(label.ownerDocument).HTMLInputElement && labelled.type === 'range') {
    const partner = label.parentElement?.querySelector('input[type="number"]');
    return partner instanceof viewOf(label.ownerDocument).HTMLInputElement ? partner : null;
  }
  if (labelled !== null && labelled !== undefined) return null;
  const next = label.nextElementSibling;
  const field = next?.matches('input[type="number"]') ? next : next?.querySelector('input[type="number"]');
  return field instanceof viewOf(label.ownerDocument).HTMLInputElement ? field : null;
}

/** @param {HTMLInputElement} field @param {number} value @param {boolean} commit */
function write(field, value, commit) {
  const text = String(value);
  if (field.value !== text) {
    field.value = text;
    field.dispatchEvent(new (viewOf(field.ownerDocument).Event)('input', { bubbles: true }));
  }
  if (commit) field.dispatchEvent(new (viewOf(field.ownerDocument).Event)('change', { bubbles: true }));
}

/**
 * @param {{ root?: Document | HTMLElement, documentRef?: Document }} [options]
 * @returns {{ destroy(): void }}
 */
export function installScrubFields(options = {}) {
  const documentRef = options.documentRef ?? document;
  const root = options.root ?? documentRef;
  /** @type {{ field: HTMLInputElement, label: Element, startX: number, startValue: number, active: boolean, pointerId: number } | null} */
  let drag = null;

  /** @param {Event} event */
  function onOver(event) {
    const label = event.target instanceof Element ? event.target.closest('label') : null;
    if (label !== null && !label.hasAttribute('data-scrub') && scrubTarget(label) !== null) label.setAttribute('data-scrub', '');
  }

  /** @param {PointerEvent} event */
  function onDown(event) {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const label = event.target.closest('label');
    if (label === null) return;
    const field = scrubTarget(label);
    if (field === null || field.disabled || field.readOnly) return;
    // Un appui sur le champ lui-même (dans l'étiquette) est une saisie, pas un glisser.
    if (event.target === field || field.contains(event.target)) return;
    drag = { field, label, startX: event.clientX, startValue: Number.parseFloat(field.value) || 0, active: false, pointerId: event.pointerId };
  }

  /** @param {PointerEvent} event */
  function onMove(event) {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const moved = event.clientX - drag.startX;
    if (!drag.active) {
      if (Math.abs(moved) < START_THRESHOLD) return;
      drag.active = true;
      // Le champ resté actif garderait son propre « annuler » : Ctrl+Z doit défaire le glisser dans l'historique de la scène.
      const focused = documentRef.activeElement;
      if (focused instanceof viewOf(documentRef).HTMLElement && focused !== drag.field && ['INPUT', 'TEXTAREA'].includes(focused.tagName)) focused.blur();
      if (documentRef.activeElement === drag.field) drag.field.blur();
      drag.label.setPointerCapture?.(event.pointerId);
      drag.label.setAttribute('data-scrubbing', '');
    }
    event.preventDefault();
    write(drag.field, scrubValue(drag.startValue, moved / PIXELS_PER_STEP, { ...fieldLimits(drag.field), factor: speedFactor(event) }), false);
  }

  /** @param {PointerEvent} event */
  function onUp(event) {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const finished = drag;
    drag = null;
    finished.label.removeAttribute('data-scrubbing');
    finished.label.releasePointerCapture?.(event.pointerId);
    if (finished.active) {
      // Le relâchement qui suit un glisser ne doit pas « cliquer » l'étiquette : cela donnerait le focus au champ.
      const swallow = (/** @type {Event} */ click) => { click.preventDefault(); click.stopPropagation(); };
      documentRef.addEventListener('click', swallow, { capture: true, once: true });
      viewOf(documentRef).setTimeout(() => documentRef.removeEventListener('click', swallow, { capture: true }), 0);
      write(finished.field, Number.parseFloat(finished.field.value), true);
    }
  }

  /** @param {KeyboardEvent} event */
  function onKey(event) {
    if (drag?.active === true && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      write(drag.field, drag.startValue, true);
      drag.label.removeAttribute('data-scrubbing');
      drag = null;
      return;
    }
    const field = event.target;
    if (!(field instanceof viewOf(documentRef).HTMLInputElement) || field.type !== 'number') return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const factor = speedFactor(event);
    if (factor === 1) return;
    event.preventDefault();
    const start = Number.parseFloat(field.value) || 0;
    write(field, scrubValue(start, event.key === 'ArrowUp' ? 1 : -1, { ...fieldLimits(field), factor }), true);
  }

  const target = /** @type {EventTarget} */ (root);
  target.addEventListener('pointerover', onOver);
  target.addEventListener('pointerdown', /** @type {EventListener} */ (onDown));
  documentRef.addEventListener('pointermove', /** @type {EventListener} */ (onMove));
  documentRef.addEventListener('pointerup', /** @type {EventListener} */ (onUp));
  documentRef.addEventListener('pointercancel', /** @type {EventListener} */ (onUp));
  documentRef.addEventListener('keydown', /** @type {EventListener} */ (onKey), true);

  return {
    destroy() {
      target.removeEventListener('pointerover', onOver);
      target.removeEventListener('pointerdown', /** @type {EventListener} */ (onDown));
      documentRef.removeEventListener('pointermove', /** @type {EventListener} */ (onMove));
      documentRef.removeEventListener('pointerup', /** @type {EventListener} */ (onUp));
      documentRef.removeEventListener('pointercancel', /** @type {EventListener} */ (onUp));
      documentRef.removeEventListener('keydown', /** @type {EventListener} */ (onKey), true);
    },
  };
}
