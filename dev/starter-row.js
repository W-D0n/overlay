// @ts-check
/**
 * dev/starter-row.js — "Modèle de départ" of a Code layer: a choice of ready-made HTML + CSS + JavaScript + settings, applied in one step. Replacing code the author has written asks a second click.
 */
import { BACKGROUND_FIELD_SCHEMAS } from './component-field-schemas.js';
import { CODE_TEMPLATES } from '../components/code-templates.js';

/**
 * Whether the code of a Code layer is still one the Studio gave (the default or a starting point): then a starting point can replace it without asking.
 * @param {Record<string, unknown>} options
 */
export function isUntouchedCode(options) {
  const defaults = Object.fromEntries(BACKGROUND_FIELD_SCHEMAS.code.map(({ key, default: value }) => [key, value]));
  const known = [defaults, ...CODE_TEMPLATES];
  return known.some((source) => ['html', 'css', 'js'].every((key) => (options[key] ?? defaults[key]) === /** @type {Record<string, unknown>} */ (source)[key]));
}

/**
 * @param {{
 *   documentRef: Document,
 *   container: HTMLElement,
 *   options: Record<string, unknown>,
 *   currentOptions?: () => Record<string, unknown>,
 *   apply: (patch: Record<string, unknown>) => void,
 * }} input `currentOptions`: the options at the time of the click (the form is not rebuilt while the author types, so `options` may be old)
 */
export function buildStarterRow({ documentRef, container, options, currentOptions, apply }) {
  const label = documentRef.createElement('label');
  label.textContent = 'Modèle de départ';
  const row = documentRef.createElement('div');
  row.className = 'starter-row';
  const select = documentRef.createElement('select');
  select.setAttribute('aria-label', 'Modèle de départ');
  const none = documentRef.createElement('option');
  none.value = '';
  none.textContent = 'Choisir un modèle…';
  select.appendChild(none);
  for (const template of CODE_TEMPLATES) {
    const option = documentRef.createElement('option');
    option.value = template.id;
    option.textContent = template.label;
    select.appendChild(option);
  }
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = 'starter-apply';
  button.disabled = true;
  const help = documentRef.createElement('p');
  help.className = 'field-help';
  help.setAttribute('role', 'status');
  let confirming = false;
  const idle = () => {
    confirming = false;
    button.textContent = 'Appliquer';
  };
  idle();
  select.addEventListener('change', () => {
    idle();
    button.disabled = select.value === '';
    help.textContent = CODE_TEMPLATES.find(({ id }) => id === select.value)?.description ?? '';
  });
  button.addEventListener('click', () => {
    const template = CODE_TEMPLATES.find(({ id }) => id === select.value);
    if (template === undefined) return;
    if (!confirming && !isUntouchedCode(currentOptions?.() ?? options)) {
      confirming = true;
      button.textContent = 'Remplacer mon code ?';
      help.textContent = 'Ce modèle remplace le HTML, le CSS, le JavaScript et les réglages exposés de cette couche (annulable d’un geste).';
      return;
    }
    apply({ html: template.html, css: template.css, js: template.js, paramSpec: template.paramSpec, params: {} });
  });
  row.append(select, button);
  container.append(label, row, help);
}
