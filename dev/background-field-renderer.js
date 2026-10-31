// @ts-check
import { BACKGROUND_FIELD_SCHEMAS } from './component-field-schemas.js';
import { isHexColor } from './color-palette-format.js';
import { isAudioOn } from '../layer-kinds.js';
import { DESIGN_TOKENS, tokenLabel } from './design-tokens.js';
import { buildNumericFieldControl } from './numeric-field-control.js';
import { assetKind } from './asset-format.js';

const DEFAULT_ADDED_COLOR = 'var(--color-gold)';

/**
 * @typedef {{ assets: () => import('./asset-client.js').LibraryAsset[], subscribe: (listener: (assets: import('./asset-client.js').LibraryAsset[]) => void) => () => void, open: (choose: (asset: import('./asset-client.js').LibraryAsset) => void, accept?: 'image' | 'font') => void }} AssetLibraryAccess
 * @typedef {import('./color-palette-format.js').NamedColor} PaletteColor
 * @typedef {import('./color-palette-format.js').NamedGradient} PaletteGradient
 */

/** @param {unknown} value */
export function backgroundColorsFieldValues(value) {
  return Array.isArray(value) && value.length > 0 ? [...value] : [DEFAULT_ADDED_COLOR];
}

/** @param {string[]} values */
export function appendBackgroundColor(values) {
  return [...values, DEFAULT_ADDED_COLOR];
}

/**
 * @param {string | null} component
 * @param {Record<string, unknown>} options
 */
export function backgroundFieldValues(component, options) {
  if (component === null) return [];
  return BACKGROUND_FIELD_SCHEMAS[component].map((field) => ({
    field,
    value: options[field.key] ?? field.default,
  }));
}

/**
 * @param {{
 *   container: HTMLElement,
 *   onChange: (key: string, value: unknown) => void,
 *   assetLibrary?: AssetLibraryAccess,
 *   documentRef?: Document,
 * }} input
 */
export function createBackgroundFieldRenderer(input) {
  const documentRef = input.documentRef ?? document;
  /** @type {{ colors: PaletteColor[], gradients: PaletteGradient[] }} */
  let palette = { colors: [], gradients: [] };
  /** Les abonnements aux listes d'images du formulaire affiché ; relâchés à chaque nouveau formulaire. @type {(() => void)[]} */
  const assetCleanups = [];

  /** @param {string} label @param {string} value @param {boolean} [selected] */
  function createOption(label, value, selected = false) {
    const option = documentRef.createElement('option');
    option.textContent = label;
    option.value = value;
    option.selected = selected;
    return option;
  }

  /** @param {unknown} value */
  function paletteColorFor(value) {
    const normalized = String(value).toLowerCase();
    return palette.colors.find((color) =>
      [color.value, color.hex, color.oklch]
        .filter((candidate) => typeof candidate === 'string')
        .some((candidate) => candidate.toLowerCase() === normalized),
    );
  }

  /** @param {unknown} value @param {(next: string) => void} onChange @param {string} name le nom du réglage, repris par chaque contrôle pour les lecteurs d'écran */
  function buildColorControl(value, onChange, name) {
    const wrapper = documentRef.createElement('div');
    wrapper.className = 'color-control';

    const picker = documentRef.createElement('input');
    picker.type = 'color';
    picker.title = 'Choisir visuellement';
    picker.setAttribute('aria-label', `${name} — choisir visuellement`);

    const text = documentRef.createElement('input');
    text.type = 'text';
    text.placeholder = '#hex, rgb(...), oklch(...), var(--...)';
    text.setAttribute('aria-label', `${name} — valeur`);

    const paletteSelect = documentRef.createElement('select');
    paletteSelect.setAttribute('aria-label', `${name} — couleur nommée`);
    paletteSelect.appendChild(createOption('Couleur nommée…', ''));
    for (const color of palette.colors) {
      paletteSelect.appendChild(createOption(`${color.name} — ${color.value}`, color.value));
    }

    /** @param {unknown} next */
    function reflect(next) {
      const stringValue = String(next);
      text.value = stringValue;
      if (isHexColor(stringValue)) picker.value = stringValue;
      paletteSelect.value = paletteColorFor(stringValue)?.value ?? '';
    }

    picker.oninput = () => {
      reflect(picker.value);
      onChange(picker.value);
    };
    text.oninput = () => {
      const next = text.value;
      if (isHexColor(next)) picker.value = next;
      paletteSelect.value = paletteColorFor(next)?.value ?? '';
      onChange(next);
    };
    paletteSelect.onchange = () => {
      if (paletteSelect.value === '') return;
      reflect(paletteSelect.value);
      onChange(paletteSelect.value);
    };

    reflect(value);
    wrapper.append(picker, text, paletteSelect);
    return wrapper;
  }

  /** @param {import('../layer-kinds.js').FieldSchema} field @param {unknown} value */
  function buildAssetField(field, value) {
    const wrapper = documentRef.createElement('div');
    wrapper.className = 'asset-field';
    const select = documentRef.createElement('select');
    select.setAttribute('aria-label', field.label);
    let current = typeof value === 'string' ? value : '';
    const accept = field.accept === 'font' ? 'font' : 'image';
    /** @param {import('./asset-client.js').LibraryAsset[]} assets */
    function fill(assets) {
      select.replaceChildren(createOption(accept === 'font' ? '(aucune police)' : '(aucune image)', '', current === ''));
      for (const asset of assets.filter((candidate) => assetKind(candidate.type) === accept)) select.appendChild(createOption(asset.name, asset.id, asset.id === current));
      // Un asset qui n'est plus dans la médiathèque reste visible comme tel : le choisir à nouveau est possible, le taire ne l'est pas.
      if (current !== '' && !assets.some((asset) => asset.id === current)) select.appendChild(createOption(accept === 'font' ? '(police manquante)' : '(image manquante)', current, true));
    }
    fill(input.assetLibrary?.assets() ?? []);
    select.onchange = () => {
      current = select.value;
      input.onChange(field.key, current);
    };
    const library = documentRef.createElement('button');
    library.type = 'button';
    library.textContent = 'Médiathèque…';
    library.onclick = () => input.assetLibrary?.open((asset) => {
      current = asset.id;
      input.onChange(field.key, current);
      fill(input.assetLibrary?.assets() ?? []);
    }, accept);
    const unsubscribe = input.assetLibrary?.subscribe(fill);
    if (unsubscribe !== undefined) assetCleanups.push(unsubscribe);
    wrapper.append(select, library);
    return wrapper;
  }

  /** @param {import('../layer-kinds.js').FieldSchema} field @param {unknown} value */
  function buildTokenField(field, value) {
    const wrapper = documentRef.createElement('div');
    const select = documentRef.createElement('select');
    select.setAttribute('aria-label', field.label);
    const tokens = field.tokenCategory === undefined ? [] : DESIGN_TOKENS[field.tokenCategory];
    const isToken = typeof value === 'string' && tokens.includes(value);
    for (const token of tokens) {
      select.appendChild(createOption(tokenLabel(token), token, token === value));
    }
    select.appendChild(createOption('Personnalisé…', '__custom__', !isToken));

    const customInput = documentRef.createElement('input');
    customInput.type = 'text';
    customInput.value = isToken ? '' : String(value);
    customInput.placeholder = '#hex, rgb(...), var(--...)';
    customInput.style.marginTop = 'var(--space-xs)';
    customInput.hidden = isToken;

    select.onchange = () => {
      const isCustom = select.value === '__custom__';
      customInput.hidden = !isCustom;
      if (isCustom) customInput.focus();
      else input.onChange(field.key, select.value);
    };
    customInput.oninput = () => input.onChange(field.key, customInput.value);
    wrapper.append(select, customInput);
    return wrapper;
  }

  /** @param {import('../layer-kinds.js').FieldSchema} field @param {unknown} value */
  function buildColorsField(field, value) {
    const wrapper = documentRef.createElement('div');
    wrapper.className = 'colors-control';
    let values = backgroundColorsFieldValues(value);

    const toolbar = documentRef.createElement('div');
    toolbar.className = 'colors-toolbar';
    const gradientSelect = documentRef.createElement('select');
    gradientSelect.setAttribute('aria-label', `${field.label} — appliquer un gradient`);
    gradientSelect.appendChild(createOption('Appliquer un gradient…', ''));
    for (const gradient of palette.gradients) {
      gradientSelect.appendChild(createOption(
        `${gradient.name} — ${gradient.colors.length} couleurs`,
        gradient.name,
      ));
    }
    const add = documentRef.createElement('button');
    add.type = 'button';
    add.textContent = '+ Couleur';
    const list = documentRef.createElement('div');
    list.className = 'color-list';

    function publish() {
      input.onChange(field.key, [...values]);
    }

    function renderRows() {
      list.replaceChildren();
      values.forEach((colorValue, index) => {
        const row = documentRef.createElement('div');
        row.className = 'color-list-row';
        row.appendChild(buildColorControl(colorValue, (next) => {
          values[index] = next;
          publish();
        }, `${field.label} ${index + 1}`));
        const remove = documentRef.createElement('button');
        remove.type = 'button';
        remove.className = 'color-remove';
        remove.textContent = '−';
        remove.title = 'Retirer cette couleur';
        remove.disabled = values.length === 1;
        remove.onclick = () => {
          values.splice(index, 1);
          renderRows();
          publish();
        };
        row.appendChild(remove);
        list.appendChild(row);
      });
    }

    gradientSelect.onchange = () => {
      const gradient = palette.gradients.find(({ name }) => name === gradientSelect.value);
      if (!gradient) return;
      values = [...gradient.colors];
      gradientSelect.value = '';
      renderRows();
      publish();
    };
    add.onclick = () => {
      values = appendBackgroundColor(values);
      renderRows();
      publish();
    };
    toolbar.append(gradientSelect, add);
    wrapper.append(toolbar, list);
    renderRows();
    return wrapper;
  }

  /** @param {import('../layer-kinds.js').FieldSchema} field @param {unknown} value */
  function buildField(field, value) {
    if (field.type === 'token') return buildTokenField(field, value);
    if (field.type === 'color') {
      return buildColorControl(value, (next) => input.onChange(field.key, next), field.label);
    }
    if (field.type === 'colors') return buildColorsField(field, value);
    if (field.type === 'asset') return buildAssetField(field, value);
    if (field.type === 'select') {
      const select = documentRef.createElement('select');
      select.setAttribute('aria-label', field.label);
      for (const choice of field.choices ?? []) {
        select.appendChild(createOption(choice, choice, choice === value));
      }
      select.onchange = () => input.onChange(field.key, select.value);
      return select;
    }
    if (field.type === 'boolean') {
      const checkbox = documentRef.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.setAttribute('aria-label', field.label);
      checkbox.checked = isAudioOn(value);
      checkbox.onchange = () => input.onChange(field.key, checkbox.checked);
      return checkbox;
    }
    if (field.type === 'textarea') {
      const textarea = documentRef.createElement('textarea');
      textarea.setAttribute('aria-label', field.label);
      textarea.value = Array.isArray(value) ? value.join('\n') : '';
      textarea.oninput = () => input.onChange(
        field.key,
        textarea.value.split('\n').filter((line) => line.length > 0),
      );
      return textarea;
    }
    if (field.type === 'number') {
      return buildNumericFieldControl(
        field,
        value,
        (next) => input.onChange(field.key, next),
        { documentRef },
      );
    }
    const text = documentRef.createElement('input');
    text.type = 'text';
    text.setAttribute('aria-label', field.label);
    text.value = String(value ?? '');
    text.oninput = () => input.onChange(field.key, text.value);
    return text;
  }

  return {
    /** @param {{ colors?: PaletteColor[], gradients?: PaletteGradient[] }} next */
    setPalette(next) {
      palette = {
        colors: Array.isArray(next.colors) ? next.colors : [],
        gradients: Array.isArray(next.gradients) ? next.gradients : [],
      };
    },
    /** @param {string | null} component @param {Record<string, unknown>} options */
    render(component, options) {
      for (const cleanup of assetCleanups.splice(0)) cleanup();
      input.container.replaceChildren();
      for (const { field, value } of backgroundFieldValues(component, options)) {
        const label = documentRef.createElement('label');
        label.textContent = field.label;
        input.container.append(label, buildField(field, value));
        if (field.description) {
          const help = documentRef.createElement('p');
          help.className = 'field-help';
          help.textContent = field.description;
          input.container.appendChild(help);
        }
      }
    },
  };
}
