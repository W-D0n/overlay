// @ts-check
import { ADJUSTMENTS, ADJUST_KEYS, DEFAULT_GLOW, GLOW_LIMITS, setAdjustment, setGlow } from '../layer-filters.js';

/**
 * dev/filters-controller.js — La section « Filtres » de l'inspecteur : les réglages de couleur (luminosité, contraste, saturation, teinte) et la lueur de la couche
 * sélectionnée (`layer-filters.js`). Chaque réglage a un curseur et un nombre ; remettre la valeur neutre le retire du document. La lueur s'allume par une case, avec sa couleur,
 * sa portée et son intensité. Tout s'écrit par les commandes de l'éditeur (annulable). Une seule couche à la fois. La structure est construite une fois ; l'affichage ne réécrit
 * jamais un champ en cours de saisie.
 *
 * @param {{
 *   elements: { body: HTMLElement, hint: HTMLElement },
 *   studio: ReturnType<typeof import('./studio-document.js').createStudioDocument>,
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   documentRef?: Document,
 * }} input
 */
export function createFiltersController(input) {
  const documentRef = input.documentRef ?? document;
  const { elements, studio } = input;
  const { editor } = studio;

  /** @param {string} tag @param {string} [className] @param {string} [text] */
  function node(tag, className, text) {
    const el = documentRef.createElement(tag);
    if (className !== undefined) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  /** @returns {import('../scene-doc.js').Layer | undefined} la couche sélectionnée, quand il n'y en a qu'une */
  function selectedLayer() {
    const { selection } = editor.state();
    if (selection.length !== 1) return undefined;
    return studio.state().scene.layers.find((layer) => layer.id === selection[0]);
  }

  /** @param {{ ok: boolean, message?: string }} result */
  function settle(result) {
    if (!result.ok && result.message !== undefined) input.report.error(result.message);
  }

  /** @param {(filters: import('../layer-filters.js').Filters | undefined) => import('../layer-filters.js').Filters | undefined} change @param {string} key */
  function commit(change, key) {
    const layer = selectedLayer();
    if (layer === undefined) return;
    settle(editor.setLayers([layer.id], { filters: change(layer.filters) }, { coalesceKey: `filters:${layer.id}:${key}` }));
  }

  /** @param {HTMLInputElement} field @param {string} value */
  function show(field, value) {
    if (documentRef.activeElement !== field) field.value = value;
  }

  /**
   * Un réglage : son nom, un curseur et un nombre qui se suivent.
   * @param {{ label: string, aria: string, min: number, max: number, step: number, unit: string, onInput: (value: number) => void }} spec
   * @returns {{ row: HTMLElement, range: HTMLInputElement, number: HTMLInputElement }}
   */
  function slider({ label, aria, min, max, step, unit, onInput }) {
    const row = node('div', 'filter-row');
    const caption = node('span', 'filter-label', label);
    const range = /** @type {HTMLInputElement} */ (node('input'));
    range.type = 'range';
    const number = /** @type {HTMLInputElement} */ (node('input'));
    number.type = 'number';
    for (const field of [range, number]) {
      field.min = String(min);
      field.max = String(max);
      field.step = String(step);
    }
    range.setAttribute('aria-label', `${aria} (curseur)`);
    number.setAttribute('aria-label', `${aria}${unit === '' ? '' : ` en ${unit}`}`);
    for (const field of [range, number]) {
      field.addEventListener('input', () => {
        const typed = Number.parseFloat(field.value.replace(',', '.'));
        if (Number.isFinite(typed)) onInput(typed);
      });
    }
    number.addEventListener('blur', render);
    row.append(caption, range, number);
    return { row, range, number };
  }

  /** @type {Record<string, { range: HTMLInputElement, number: HTMLInputElement }>} */
  const adjustFields = {};
  for (const key of ADJUST_KEYS) {
    const { label, min, max, step, unit } = ADJUSTMENTS[key];
    const { row, range, number } = slider({ label, aria: label, min, max, step, unit, onInput: (value) => commit((filters) => setAdjustment(filters, key, value), key) });
    row.dataset.filter = key;
    elements.body.appendChild(row);
    adjustFields[key] = { range, number };
  }

  // La lueur : une case, puis sa couleur, sa portée et son intensité.
  const glow = node('div', 'filter-glow');
  glow.dataset.filter = 'glow';
  const toggleWrap = node('label', 'filter-toggle');
  const toggle = /** @type {HTMLInputElement} */ (node('input'));
  toggle.type = 'checkbox';
  toggle.setAttribute('aria-label', 'Lueur');
  toggleWrap.append(toggle, node('span', undefined, 'Lueur'));
  const color = /** @type {HTMLInputElement} */ (node('input'));
  color.type = 'color';
  color.setAttribute('aria-label', 'Couleur de la lueur');
  color.addEventListener('input', () => commit((filters) => setGlow(filters, { color: color.value }), 'glow-color'));
  const glowHead = node('div', 'filter-row filter-glow-head');
  glowHead.append(toggleWrap, color);
  const size = slider({ label: 'Portée', aria: 'Portée de la lueur', ...GLOW_LIMITS.size, unit: 'px', onInput: (value) => commit((filters) => setGlow(filters, { size: value }), 'glow-size') });
  const intensity = slider({ label: 'Intensité', aria: 'Intensité de la lueur', ...GLOW_LIMITS.intensity, unit: '', onInput: (value) => commit((filters) => setGlow(filters, { intensity: value }), 'glow-intensity') });
  size.row.dataset.filter = 'glow-size';
  intensity.row.dataset.filter = 'glow-intensity';
  glow.append(glowHead, size.row, intensity.row);
  elements.body.appendChild(glow);
  toggle.addEventListener('change', () => commit((filters) => setGlow(filters, toggle.checked ? {} : null), 'glow-toggle'));

  function render() {
    const layer = selectedLayer();
    const { selection } = editor.state();
    elements.body.hidden = layer === undefined;
    elements.hint.textContent = selection.length === 0 ? '' : layer === undefined
      ? 'Sélectionnez une seule couche pour régler ses filtres.'
      : layer.filters === undefined
        ? 'Couleurs et lueur de la couche. Chaque valeur neutre n’est pas écrite : « Réinitialiser » remet tout à zéro.'
        : 'Remettre un réglage à sa valeur neutre le retire de la couche.';
    if (layer === undefined) return;
    const { filters } = layer;
    for (const key of ADJUST_KEYS) {
      const value = String(filters?.[key] ?? ADJUSTMENTS[key].neutral);
      show(adjustFields[key].range, value);
      show(adjustFields[key].number, value);
    }
    const lit = filters?.glow !== undefined;
    toggle.checked = lit;
    const shown = filters?.glow ?? DEFAULT_GLOW;
    show(color, shown.color.toLowerCase());
    for (const [field, value] of /** @type {const} */ ([[size, shown.size], [intensity, shown.intensity]])) {
      show(field.range, String(value));
      show(field.number, String(value));
    }
    for (const control of [color, size.range, size.number, intensity.range, intensity.number]) control.disabled = !lit;
  }

  studio.subscribe(render);
  render();

  return { render };
}
