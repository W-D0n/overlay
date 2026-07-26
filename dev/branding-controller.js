// @ts-check
import { BrandingLayer } from '../components/BrandingLayer.js';
import { normalizeBranding } from '../branding-format.js';
import { pointerToPercent } from './branding-drag.js';

/**
 * dev/branding-controller.js — Section « Branding » du tuner.
 *
 * Le contenu est global (enregistré à part), sa visibilité appartient au preset affiché. La
 * position se pose au glisser-déposer dans l'aperçu ; les champs restent la source de vérité pour
 * tout le reste.
 * Voir docs/specs/background-branding-layer.md.
 *
 * @param {{
 *   layer: HTMLElement,
 *   fields: {
 *     name: HTMLInputElement,
 *     lines: HTMLTextAreaElement,
 *     nameSize: HTMLInputElement,
 *     lineSize: HTMLInputElement,
 *     color: HTMLInputElement,
 *     opacity: HTMLInputElement,
 *     position: HTMLElement,
 *     showOnPreset: HTMLInputElement,
 *   },
 *   documentRef: Document,
 *   client: { saveBranding(branding: unknown): Promise<*> },
 *   report: { ok(message?: string): void, error(message: string): void },
 *   onShowOnPresetChange: (visible: boolean) => void,
 * }} input
 */
export function createBrandingController(input) {
  const preview = BrandingLayer();
  // Seule différence avec l'URL OBS : dans le tuner, le bloc doit pouvoir être attrapé.
  preview.el.style.zIndex = '3';
  const block = /** @type {HTMLElement} */ (preview.el.firstElementChild);
  block.style.pointerEvents = 'auto';
  block.style.cursor = 'grab';
  input.layer.appendChild(preview.el);

  let branding = normalizeBranding(undefined);
  let visibleOnPreset = true;
  let saveTimer = 0;

  function renderPosition() {
    input.fields.position.textContent = `x ${branding.x} % · y ${branding.y} %`;
  }

  function apply() {
    preview.update(branding);
    renderPosition();
    // Masqué par le preset : l'aperçu montre ce que verra OBS (rien), mais garde le bloc
    // estompé et cerclé pour rester attrapable — sinon il deviendrait impossible à repositionner.
    block.style.outline = visibleOnPreset ? 'none' : '1px dashed var(--color-text-dim)';
    block.style.opacity = visibleOnPreset ? String(branding.opacity) : '0.3';
  }

  async function persist() {
    try {
      await input.client.saveBranding(branding);
      input.report.ok('branding enregistré');
    } catch (error) {
      input.report.error(`branding : ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function schedulePersist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 250);
  }

  /** @param {Partial<import('../branding-format.js').Branding>} patch */
  function change(patch) {
    branding = normalizeBranding({ ...branding, ...patch });
    apply();
    schedulePersist();
  }

  function readLines() {
    return input.fields.lines.value.split('\n');
  }

  input.fields.name.oninput = () => change({ name: input.fields.name.value });
  input.fields.lines.oninput = () => change({ lines: readLines() });
  input.fields.color.oninput = () => change({ color: input.fields.color.value });
  input.fields.nameSize.oninput = () => change({ nameSize: Number(input.fields.nameSize.value) });
  input.fields.lineSize.oninput = () => change({ lineSize: Number(input.fields.lineSize.value) });
  input.fields.opacity.oninput = () => change({ opacity: Number(input.fields.opacity.value) });
  input.fields.showOnPreset.onchange = () => {
    visibleOnPreset = input.fields.showOnPreset.checked;
    apply();
    input.onShowOnPresetChange(visibleOnPreset);
  };

  /** Glisser-déposer : la position suit le pointeur, l'enregistrement attend le relâchement. */
  let dragging = false;
  block.addEventListener('pointerdown', (event) => {
    dragging = true;
    block.style.cursor = 'grabbing';
    block.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  block.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const rect = input.layer.getBoundingClientRect();
    branding = normalizeBranding({
      ...branding,
      ...pointerToPercent({ pointerX: event.clientX, pointerY: event.clientY, rect }),
    });
    apply();
  });
  block.addEventListener('pointerup', (event) => {
    if (!dragging) return;
    dragging = false;
    block.style.cursor = 'grab';
    block.releasePointerCapture(event.pointerId);
    schedulePersist();
  });

  return {
    /** @param {unknown} nextBranding */
    render(nextBranding) {
      branding = normalizeBranding(nextBranding);
      input.fields.name.value = branding.name;
      input.fields.lines.value = branding.lines.join('\n');
      input.fields.color.value = branding.color;
      input.fields.nameSize.value = String(branding.nameSize);
      input.fields.lineSize.value = String(branding.lineSize);
      input.fields.opacity.value = String(branding.opacity);
      apply();
    },
    /** @param {boolean} visible */
    renderShowOnPreset(visible) {
      visibleOnPreset = visible;
      input.fields.showOnPreset.checked = visible;
      apply();
    },
    destroy() {
      clearTimeout(saveTimer);
      preview.destroy();
    },
  };
}
