// @ts-check
import { DEFAULT_MASKS, MASK_LIMITS, MASK_SHAPES, setMask } from '../../src/layers/layer-mask.js';
import { createSliderRow } from '../ui/slider-row.js';

/**
 * studio/inspector/mask-controller.js — The "Masque" section of the inspector: a shape (none, rectangle, ellipse, linear fade) and its settings for the selected layer (`layer-mask.js`).
 * Positions, sizes and fades are shown in percent of the layer. Every change goes through the editor's commands (undoable); one layer at a time. The structure is built once;
 * the display never rewrites a field being typed in.
 *
 * @param {{
 *   elements: { body: HTMLElement, hint: HTMLElement },
 *   studio: ReturnType<typeof import('../editor/studio-document.js').createStudioDocument>,
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   documentRef?: Document,
 * }} input
 */
export function createMaskController(input) {
  const documentRef = input.documentRef ?? document;
  const { elements, studio } = input;
  const { editor } = studio;

  /** @returns {import('../../src/scene/scene-doc.js').Layer | undefined} the selected layer, when there is only one */
  function selectedLayer() {
    const { selection } = editor.state();
    if (selection.length !== 1) return undefined;
    return studio.state().scene.layers.find((layer) => layer.id === selection[0]);
  }

  /**
   * Slider drags of one setting make one history step; choosing a shape or inverting is a discrete choice, one step each.
   * @param {(mask: import('../../src/layers/layer-mask.js').Mask | undefined) => import('../../src/layers/layer-mask.js').Mask | undefined} change @param {string} key @param {boolean} [coalesce]
   */
  function commit(change, key, coalesce = true) {
    const layer = selectedLayer();
    if (layer === undefined) return;
    const result = editor.setLayers([layer.id], { mask: change(layer.mask) }, coalesce ? { coalesceKey: `mask:${layer.id}:${key}` } : {});
    if (!result.ok && result.message !== undefined) input.report.error(result.message);
  }

  /** @param {HTMLInputElement | HTMLSelectElement} field @param {string} value */
  function show(field, value) {
    if (documentRef.activeElement !== field) field.value = value;
  }

  const shape = documentRef.createElement('select');
  shape.setAttribute('aria-label', 'Forme du masque');
  for (const [value, label] of [['none', 'Aucun masque'], ...MASK_SHAPES.map(({ id, label: text }) => [id, text])]) {
    const option = documentRef.createElement('option');
    option.value = value;
    option.textContent = label;
    shape.appendChild(option);
  }
  const shapeRow = documentRef.createElement('div');
  shapeRow.className = 'filter-row';
  shapeRow.append(shape);
  elements.body.appendChild(shapeRow);
  shape.addEventListener('change', () => commit((mask) => (shape.value === 'none' ? setMask(mask, null) : setMask(mask, { shape: /** @type {import('../../src/layers/layer-mask.js').MaskShape} */ (shape.value) })), 'shape', false));

  /** The settings; a fraction is shown in percent of the layer. @type {{ key: string, percent: boolean, shapes: string[], range: HTMLInputElement, number: HTMLInputElement, row: HTMLElement }[]} */
  const fields = [];
  const spec = /** @type {const} */ ([
    ['x', 'Position horizontale', MASK_LIMITS.position, true, ['rectangle', 'ellipse']],
    ['y', 'Position verticale', MASK_LIMITS.position, true, ['rectangle', 'ellipse']],
    ['width', 'Largeur', MASK_LIMITS.size, true, ['rectangle', 'ellipse']],
    ['height', 'Hauteur', MASK_LIMITS.size, true, ['rectangle', 'ellipse']],
    ['feather', 'Bords adoucis', MASK_LIMITS.feather, true, ['rectangle', 'ellipse']],
    ['angle', 'Angle', MASK_LIMITS.angle, false, ['linear']],
    ['start', 'Début du fondu', MASK_LIMITS.stop, true, ['linear']],
    ['end', 'Fin du fondu', MASK_LIMITS.stop, true, ['linear']],
  ]);
  for (const [key, label, limits, percent, shapes] of spec) {
    const factor = percent ? 100 : 1;
    const { row, range, number } = createSliderRow(documentRef, {
      label,
      aria: label,
      min: limits.min * factor,
      max: limits.max * factor,
      step: limits.step * factor,
      unit: percent ? '%' : '°',
      onInput: (value) => commit((mask) => setMask(mask, { [key]: value / factor }), key),
      onBlur: render,
    });
    row.dataset.mask = key;
    elements.body.appendChild(row);
    fields.push({ key, percent, shapes: [...shapes], range, number, row });
  }

  const invertWrap = documentRef.createElement('label');
  invertWrap.className = 'filter-toggle';
  invertWrap.dataset.mask = 'invert';
  const invert = documentRef.createElement('input');
  invert.type = 'checkbox';
  invert.setAttribute('aria-label', 'Inverser le masque');
  const invertText = documentRef.createElement('span');
  invertText.textContent = 'Inverser (montrer l’extérieur)';
  invertWrap.append(invert, invertText);
  elements.body.appendChild(invertWrap);
  invert.addEventListener('change', () => commit((mask) => (mask === undefined ? undefined : setMask(mask, { invert: invert.checked ? true : undefined })), 'invert', false));

  function render() {
    const layer = selectedLayer();
    const { selection } = editor.state();
    elements.body.hidden = layer === undefined;
    elements.hint.textContent = selection.length === 0 ? '' : layer === undefined
      ? 'Sélectionnez une seule couche pour régler son masque.'
      : layer.mask === undefined
        ? 'Un masque ne montre qu’une partie de la couche (ou d’un groupe entier) : rectangle, ellipse ou dégradé.'
        : 'Le masque découpe la couche ; « Inverser » montre l’extérieur à la place.';
    if (layer === undefined) return;
    const { mask } = layer;
    show(shape, mask?.shape ?? 'none');
    const shown = /** @type {Record<string, number>} */ (/** @type {unknown} */ (mask ?? DEFAULT_MASKS.rectangle));
    for (const field of fields) {
      const active = mask !== undefined && field.shapes.includes(mask.shape);
      field.row.hidden = !active;
      if (!active) continue;
      const value = String(Number((shown[field.key] * (field.percent ? 100 : 1)).toFixed(2)));
      show(field.range, value);
      show(field.number, value);
    }
    invertWrap.hidden = mask === undefined;
    invert.checked = mask?.invert === true;
  }

  studio.subscribe(render);
  render();

  return { render };
}
