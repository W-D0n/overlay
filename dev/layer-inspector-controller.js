// @ts-check
/**
 * dev/layer-inspector-controller.js — L'inspecteur de la sélection : opacité, position et taille, alignement.
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
import { icon, setIcon } from './icons.js';
import {
  PLACEMENT_PRESETS, alignPlacements, applyPlacementChange, distributePlacements, fromDisplay, matchingPreset, toDisplay,
} from './placement-math.js';

const KEYS = /** @type {const} */ (['x', 'y', 'width', 'height']);
const UNIT_STORAGE_KEY = 'overlay.studio.placement-unit';

/**
 * @param {{
 *   elements: {
 *     empty: HTMLElement,
 *     body: HTMLElement,
 *     opacityRange: HTMLInputElement,
 *     opacityNumber: HTMLInputElement,
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

  /** @type {Unit} */
  let unit = 'percent';
  try {
    if (windowRef.localStorage?.getItem(UNIT_STORAGE_KEY) === 'pixel') unit = 'pixel';
  } catch {
    // Stockage indisponible (fenêtre privée, accès refusé) : l'unité par défaut reste valable.
  }
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

  for (const key of KEYS) {
    elements.fields[key].addEventListener('input', () => onPlacementInput(key, elements.fields[key].value));
    // Quitter le champ réaffiche la valeur effective (bornée, arrondie) à la place de ce qui a été tapé.
    elements.fields[key].addEventListener('blur', render);
  }
  elements.opacityRange.addEventListener('input', () => onOpacityInput(elements.opacityRange.value));
  elements.opacityNumber.addEventListener('input', () => onOpacityInput(elements.opacityNumber.value));
  elements.opacityNumber.addEventListener('blur', render);

  /** @param {Unit} next */
  function setUnit(next) {
    unit = next;
    try {
      windowRef.localStorage?.setItem(UNIT_STORAGE_KEY, next);
    } catch {
      // Sans stockage, l'unité vaut pour cette session seulement.
    }
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
  render();

  return { render };
}
