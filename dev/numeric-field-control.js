// @ts-check

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
export function clampNumericFieldValue(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Contrôle numérique commun au tuner de fonds et à l'éditeur de scènes.
 * @param {import('./component-field-schemas.js').FieldSchema} field
 * @param {unknown} currentValue
 * @param {(value: number) => void} onChange
 * @param {{ exactEvent?: 'input'|'change', documentRef?: Document }} [options]
 */
export function buildNumericFieldControl(field, currentValue, onChange, options = {}) {
  const documentRef = options.documentRef ?? document;
  const min = Number(field.min);
  const max = Number(field.max);
  const step = Number(field.step);
  const value = clampNumericFieldValue(Number(currentValue), min, max);

  const wrapper = documentRef.createElement('div');
  wrapper.className = 'numeric-control';
  const range = documentRef.createElement('input');
  range.type = 'range';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(value);
  const exact = documentRef.createElement('input');
  exact.type = 'number';
  exact.min = range.min;
  exact.max = range.max;
  exact.step = range.step;
  exact.value = String(value);
  const unit = documentRef.createElement('span');
  unit.className = 'field-unit';
  unit.textContent = field.unit ?? '';

  function publish(next) {
    if (!Number.isFinite(next)) return;
    const bounded = clampNumericFieldValue(next, min, max);
    range.value = String(bounded);
    exact.value = String(bounded);
    onChange(bounded);
  }

  range.addEventListener('input', () => publish(Number(range.value)));
  exact.addEventListener(options.exactEvent ?? 'input', () => {
    if (exact.value !== '') publish(Number(exact.value));
  });
  wrapper.append(range, exact, unit);
  return wrapper;
}
