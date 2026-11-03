// @ts-check

/**
 * dev/slider-row.js — A labelled setting of the inspector: a slider and a number that follow each other. Typing a number or moving the slider calls `onInput` with the value; the
 * number is shown again from the document when it loses focus, so a half-typed value never stays.
 *
 * @param {Document} documentRef
 * @param {{ label: string, aria: string, min: number, max: number, step: number, unit: string, onInput: (value: number) => void, onBlur?: () => void }} spec
 * @returns {{ row: HTMLElement, range: HTMLInputElement, number: HTMLInputElement }}
 */
export function createSliderRow(documentRef, { label, aria, min, max, step, unit, onInput, onBlur }) {
  const row = documentRef.createElement('div');
  row.className = 'filter-row';
  const caption = documentRef.createElement('span');
  caption.className = 'filter-label';
  caption.textContent = label;
  const range = documentRef.createElement('input');
  range.type = 'range';
  const number = documentRef.createElement('input');
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
  if (onBlur !== undefined) number.addEventListener('blur', onBlur);
  row.append(caption, range, number);
  return { row, range, number };
}
