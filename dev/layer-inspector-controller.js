// @ts-check
/**
 * dev/layer-inspector-controller.js — L'inspecteur de la sélection : opacité, rendu (fusion, rotation, flou, rognage),
 * position et taille, alignement.
 *
 * Il lit la sélection du document du Studio et n'écrit que par les commandes de l'éditeur (annulables). Position et
 * taille se saisissent en pourcentage de la toile ou en pixels de la source (`render-reference.js`) ; la scène, elle,
 * garde des fractions. Avec « proportions liées », changer la largeur ou la hauteur garde le rapport en pixels.
 * Sur plusieurs couches, un champ dont la valeur diffère affiche « Mixte » et, saisi, s'applique à toutes.
 * Un champ en cours de saisie n'est jamais réécrit par l'affichage.
 *
 * @typedef {import('./placement-math.js').PlacementKey} PlacementKey
 * @typedef {import('./placement-math.js').Unit} Unit
 */
import { BLEND_MODES, CROP_SIDES, LOOK_LIMITS } from '../scene-doc.js';
import { icon, setIcon } from './icons.js';
import {
  PLACEMENT_PRESETS, alignPlacements, applyPlacementChange, distributePlacements, fromDisplay, matchingPreset, toDisplay,
} from './placement-math.js';

const KEYS = /** @type {const} */ (['x', 'y', 'width', 'height']);
const UNIT_PREFERENCE = 'placement.unit';

/**
 * @param {{
 *   elements: {
 *     empty: HTMLElement,
 *     body: HTMLElement,
 *     opacityRange: HTMLInputElement,
 *     opacityNumber: HTMLInputElement,
 *     blend: HTMLSelectElement,
 *     rotationRange: HTMLInputElement,
 *     rotationNumber: HTMLInputElement,
 *     blurRange: HTMLInputElement,
 *     blurNumber: HTMLInputElement,
 *     crop: Record<import('../scene-doc.js').CropSide, HTMLInputElement>,
 *     fields: Record<PlacementKey, HTMLInputElement>,
 *     unitPercent: HTMLButtonElement,
 *     unitPixel: HTMLButtonElement,
 *     lock: HTMLButtonElement,
 *     preset: HTMLSelectElement,
 *     reset: HTMLButtonElement,
 *     reference: HTMLSelectElement,
 *     align: Record<import('./placement-math.js').AlignMode, HTMLButtonElement>,
 *     distributeH: HTMLButtonElement,
 *     distributeV: HTMLButtonElement,
 *   },
 *   studio: ReturnType<typeof import('./studio-document.js').createStudioDocument>,
 *   preferences: { getPreference: (key: string, fallback: string) => string, setPreference: (key: string, value: string) => void, subscribe: (listener: () => void) => () => void },
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   documentRef?: Document,
 *   windowRef?: Window,
 * }} input
 */
export function createLayerInspectorController(input) {
  const documentRef = input.documentRef ?? document;
  const windowRef = input.windowRef ?? window;
  const { elements, studio } = input;
  const { editor } = studio;

  /** @returns {Unit} */
  const storedUnit = () => (input.preferences.getPreference(UNIT_PREFERENCE, 'percent') === 'pixel' ? 'pixel' : 'percent');
  let unit = storedUnit();
  let lockRatio = false;

  /** @returns {import('../scene-doc.js').Layer[]} les couches sélectionnées, du dessous au dessus */
  function selected() {
    const { selection } = editor.state();
    return studio.state().scene.layers.filter((layer) => selection.includes(layer.id));
  }

  /** @param {{ ok: boolean, message?: string }} result */
  function settle(result) {
    if (!result.ok && result.message !== undefined) input.report.error(result.message);
    return result.ok;
  }

  /** Les couches du document qui ont un placement modifiable. */
  const ids = () => selected().map((layer) => layer.id);

  // ── Affichage ───────────────────────────────────────────────────────────

  /** @param {HTMLInputElement} field @param {string} value @param {string} [placeholder] */
  function showValue(field, value, placeholder = '') {
    if (documentRef.activeElement === field) return;
    field.value = value;
    field.placeholder = placeholder;
  }

  function render() {
    const layers = selected();
    elements.empty.hidden = layers.length > 0;
    elements.body.hidden = layers.length === 0;
    if (layers.length === 0) return;

    for (const key of KEYS) {
      const values = layers.map((layer) => toDisplay(key, layer.placement[key], unit));
      const mixed = values.some((value) => value !== values[0]);
      showValue(elements.fields[key], mixed ? '' : String(values[0]), mixed ? 'Mixte' : '');
      elements.fields[key].step = unit === 'percent' ? '0.5' : '1';
    }
    const opacities = layers.map((layer) => Math.round(layer.opacity * 100));
    const mixedOpacity = opacities.some((value) => value !== opacities[0]);
    elements.opacityRange.value = String(mixedOpacity ? 100 : opacities[0]);
    showValue(elements.opacityNumber, mixedOpacity ? '' : String(opacities[0]), mixedOpacity ? 'Mixte' : '');

    renderLook(layers);

    elements.unitPercent.setAttribute('aria-pressed', String(unit === 'percent'));
    elements.unitPixel.setAttribute('aria-pressed', String(unit === 'pixel'));
    elements.lock.setAttribute('aria-pressed', String(lockRatio));
    setIcon(elements.lock, lockRatio ? 'link' : 'unlink');
    elements.lock.title = lockRatio ? 'Proportions liées : modifier la largeur ou la hauteur garde le rapport' : 'Proportions libres';

    const only = layers[0].placement;
    const matching = layers.length === 1 ? matchingPreset(only) : null;
    elements.preset.value = matching ?? '';

    const selectionRef = layers.length >= 2;
    const reference = /** @type {HTMLOptionElement} */ (elements.reference.querySelector('option[value="selection"]'));
    reference.disabled = !selectionRef;
    if (!selectionRef && elements.reference.value === 'selection') elements.reference.value = 'canvas';
    elements.distributeH.disabled = layers.length < 3;
    elements.distributeV.disabled = layers.length < 3;
  }

  /** @param {import('../scene-doc.js').Layer[]} layers */
  function renderLook(layers) {
    const blends = layers.map((layer) => layer.blend ?? 'normal');
    const mixedBlend = blends.some((value) => value !== blends[0]);
    elements.blend.value = mixedBlend ? '' : blends[0];
    /** @type {[HTMLInputElement, HTMLInputElement, (layer: import('../scene-doc.js').Layer) => number][]} */
    const scalars = [
      [elements.rotationRange, elements.rotationNumber, (layer) => layer.rotation ?? 0],
      [elements.blurRange, elements.blurNumber, (layer) => layer.blur ?? 0],
    ];
    for (const [range, number, read] of scalars) {
      const values = layers.map(read);
      const mixed = values.some((value) => value !== values[0]);
      range.value = String(mixed ? 0 : values[0]);
      showValue(number, mixed ? '' : String(values[0]), mixed ? 'Mixte' : '');
    }
    for (const side of CROP_SIDES) {
      const values = layers.map((layer) => Math.round((layer.crop?.[side] ?? 0) * 1000) / 10);
      const mixed = values.some((value) => value !== values[0]);
      showValue(elements.crop[side], mixed ? '' : String(values[0]), mixed ? 'Mixte' : '');
    }
  }

  // ── Saisie ──────────────────────────────────────────────────────────────

  /** @param {PlacementKey} key @param {string} raw */
  function onPlacementInput(key, raw) {
    const typed = Number.parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(typed)) return;
    const fraction = fromDisplay(key, typed, unit);
    const layers = selected();
    /** @type {Record<string, Partial<import('../scene-doc.js').Placement>>} */
    const patches = {};
    for (const layer of layers) patches[layer.id] = applyPlacementChange(layer.placement, key, fraction, { lockRatio });
    settle(editor.setPlacements(patches, { coalesceKey: `placement:${key}:${ids().join(',')}`, label: 'Placer' }));
  }

  /** @param {string} raw */
  function onOpacityInput(raw) {
    const typed = Number.parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(typed)) return;
    settle(editor.setLayers(ids(), { opacity: Math.max(0, Math.min(100, typed)) / 100 }, { coalesceKey: `opacity:${ids().join(',')}` }));
  }

  /** @param {'rotation' | 'blur'} key @param {string} raw */
  function onScalarInput(key, raw) {
    const typed = Number.parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(typed)) return;
    const { min, max } = LOOK_LIMITS[key];
    settle(editor.setLayers(ids(), { [key]: Math.max(min, Math.min(max, typed)) }, { coalesceKey: `${key}:${ids().join(',')}` }));
  }

  /** @param {import('../scene-doc.js').CropSide} side @param {string} raw */
  function onCropInput(side, raw) {
    const typed = Number.parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(typed)) return;
    const { min, max } = LOOK_LIMITS.crop;
    settle(editor.setLayers(ids(), { crop: { [side]: Math.max(min, Math.min(max, typed / 100)) } }, { coalesceKey: `crop:${side}:${ids().join(',')}` }));
  }

  for (const key of KEYS) {
    elements.fields[key].addEventListener('input', () => onPlacementInput(key, elements.fields[key].value));
    // Quitter le champ réaffiche la valeur effective (bornée, arrondie) à la place de ce qui a été tapé.
    elements.fields[key].addEventListener('blur', render);
  }
  elements.opacityRange.addEventListener('input', () => onOpacityInput(elements.opacityRange.value));
  elements.opacityNumber.addEventListener('input', () => onOpacityInput(elements.opacityNumber.value));
  elements.opacityNumber.addEventListener('blur', render);

  for (const mode of BLEND_MODES) {
    const option = documentRef.createElement('option');
    option.value = mode.id;
    option.textContent = mode.label;
    elements.blend.appendChild(option);
  }
  elements.blend.addEventListener('change', () => {
    if (elements.blend.value === '') return;
    settle(editor.setLayers(ids(), { blend: /** @type {import('../scene-doc.js').BlendMode} */ (elements.blend.value) }));
  });
  for (const [key, range, number] of /** @type {const} */ ([['rotation', elements.rotationRange, elements.rotationNumber], ['blur', elements.blurRange, elements.blurNumber]])) {
    range.addEventListener('input', () => onScalarInput(key, range.value));
    number.addEventListener('input', () => onScalarInput(key, number.value));
    number.addEventListener('blur', render);
  }
  for (const side of CROP_SIDES) {
    elements.crop[side].addEventListener('input', () => onCropInput(side, elements.crop[side].value));
    elements.crop[side].addEventListener('blur', render);
  }

  /** @param {Unit} next */
  function setUnit(next) {
    unit = next;
    input.preferences.setPreference(UNIT_PREFERENCE, next);
    render();
  }
  elements.unitPercent.addEventListener('click', () => setUnit('percent'));
  elements.unitPixel.addEventListener('click', () => setUnit('pixel'));
  elements.lock.addEventListener('click', () => {
    lockRatio = !lockRatio;
    render();
  });

  elements.preset.addEventListener('change', () => {
    const preset = PLACEMENT_PRESETS.find(({ id }) => id === elements.preset.value);
    if (preset === undefined) return;
    /** @type {Record<string, Partial<import('../scene-doc.js').Placement>>} */
    const patches = {};
    for (const id of ids()) patches[id] = { ...preset.placement };
    settle(editor.setPlacements(patches, { label: preset.label }));
  });
  elements.reset.addEventListener('click', () => { settle(editor.resetLayers(ids())); });

  /** @param {import('./placement-math.js').AlignMode} mode */
  function align(mode) {
    const layers = selected();
    const placements = Object.fromEntries(layers.map((layer) => [layer.id, layer.placement]));
    const reference = elements.reference.value === 'selection' && layers.length >= 2 ? 'selection' : 'canvas';
    const patches = alignPlacements(placements, mode, reference);
    if (Object.keys(patches).length > 0) settle(editor.setPlacements(patches, { label: 'Aligner' }));
  }
  const ALIGN_ICONS = /** @type {const} */ ({
    left: 'align-left', hcenter: 'align-hcenter', right: 'align-right', top: 'align-top', vcenter: 'align-vcenter', bottom: 'align-bottom',
  });
  for (const mode of /** @type {const} */ (['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'])) {
    setIcon(elements.align[mode], ALIGN_ICONS[mode]);
    elements.align[mode].addEventListener('click', () => align(mode));
  }

  /** @param {'horizontal' | 'vertical'} axis */
  function distribute(axis) {
    const layers = selected();
    const patches = distributePlacements(Object.fromEntries(layers.map((layer) => [layer.id, layer.placement])), axis);
    if (Object.keys(patches).length > 0) settle(editor.setPlacements(patches, { label: 'Répartir' }));
  }
  setIcon(elements.distributeH, 'distribute-h');
  setIcon(elements.distributeV, 'distribute-v');
  elements.distributeH.addEventListener('click', () => distribute('horizontal'));
  elements.distributeV.addEventListener('click', () => distribute('vertical'));
  elements.reset.innerHTML = `${icon('reset')}<span>Réinitialiser</span>`;

  for (const preset of PLACEMENT_PRESETS) {
    const option = documentRef.createElement('option');
    option.value = preset.id;
    option.textContent = preset.label;
    elements.preset.appendChild(option);
  }

  studio.subscribe(render);
  // L'unité choisie dans un autre onglet ou une autre fenêtre s'applique ici aussi.
  input.preferences.subscribe(() => {
    unit = storedUnit();
    render();
  });
  render();

  return { render };
}
