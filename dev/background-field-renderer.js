// @ts-check
import { BACKGROUND_FIELD_SCHEMAS } from './component-field-schemas.js';
import { isHexColor } from './color-palette-format.js';
import { isAudioOn } from '../src/layers/layer-kinds.js';
import { DESIGN_TOKENS, tokenLabel } from './design-tokens.js';
import { buildNumericFieldControl } from './numeric-field-control.js';
import { assetKind } from './asset-format.js';
import { normalizeParamValues, paramFieldSchemas, parseParamSpec } from '../src/components/code-params.js';
import { createCodeField } from './code-field.js';
import { buildStarterRow } from './starter-row.js';

const DEFAULT_ADDED_COLOR = 'var(--color-gold)';

/**
 * @typedef {{ assets: () => import('./asset-client.js').LibraryAsset[], subscribe: (listener: (assets: import('./asset-client.js').LibraryAsset[]) => void) => () => void, open: (choose: (asset: import('./asset-client.js').LibraryAsset) => void, accept?: 'image' | 'font') => void }} AssetLibraryAccess
 * @typedef {Pick<NonNullable<import('../src/types.js').ComponentInstance['reports']>, 'current' | 'subscribe'>} CodeReports
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
 *   onApply?: (patch: Record<string, unknown>) => void,
 *   currentOptions?: () => Record<string, unknown>,
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
  /** Le formulaire des réglages déclarés par le code (couche Code) affiché, et ce qui le reconstruit quand la déclaration change. @type {{ host: HTMLElement, values: Record<string, unknown> } | null} */
  let paramsForm = null;
  /** Les erreurs que le code de la couche affichée a remontées. @type {CodeReports | null} */
  let codeReports = null;

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

  /** @typedef {(key: string, value: unknown) => void} Emit */

  /** @param {import('../src/layers/layer-kinds.js').FieldSchema} field @param {unknown} value @param {Emit} emit */
  function buildAssetField(field, value, emit) {
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
      emit(field.key, current);
    };
    const library = documentRef.createElement('button');
    library.type = 'button';
    library.textContent = 'Médiathèque…';
    library.onclick = () => input.assetLibrary?.open((asset) => {
      current = asset.id;
      emit(field.key, current);
      fill(input.assetLibrary?.assets() ?? []);
    }, accept);
    const unsubscribe = input.assetLibrary?.subscribe(fill);
    if (unsubscribe !== undefined) assetCleanups.push(unsubscribe);
    wrapper.append(select, library);
    return wrapper;
  }

  /** @param {import('../src/layers/layer-kinds.js').FieldSchema} field @param {unknown} value @param {Emit} emit */
  function buildTokenField(field, value, emit) {
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
      else emit(field.key, select.value);
    };
    customInput.oninput = () => emit(field.key, customInput.value);
    wrapper.append(select, customInput);
    return wrapper;
  }

  /** @param {import('../src/layers/layer-kinds.js').FieldSchema} field @param {unknown} value @param {Emit} emit */
  function buildColorsField(field, value, emit) {
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
      emit(field.key, [...values]);
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

  /**
   * @param {import('./component-field-schemas.js').FormField} field
   * @param {unknown} value
   * @param {Emit} [emit] où part le changement (par défaut, l'option de la couche réglée)
   * @param {Record<string, unknown>} [options] les options de la couche réglée (le champ « réglages » lit la déclaration qui s'y trouve)
   */
  function buildField(field, value, emit = input.onChange, options = {}) {
    if (field.type === 'token') return buildTokenField(field, value, emit);
    if (field.type === 'color') {
      return buildColorControl(value, (next) => emit(field.key, next), field.label);
    }
    if (field.type === 'colors') return buildColorsField(field, value, emit);
    if (field.type === 'asset') return buildAssetField(field, value, emit);
    if (field.type === 'code') return buildCodeField(field, value, emit);
    if (field.type === 'params') return buildParamsField(field, value, emit, options);
    if (field.type === 'select') {
      const select = documentRef.createElement('select');
      select.setAttribute('aria-label', field.label);
      for (const choice of field.choices ?? []) {
        select.appendChild(createOption(field.choiceLabels?.[choice] ?? choice, choice, choice === value));
      }
      select.onchange = () => emit(field.key, select.value);
      return select;
    }
    if (field.type === 'boolean') {
      const checkbox = documentRef.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.setAttribute('aria-label', field.label);
      checkbox.checked = isAudioOn(value);
      checkbox.onchange = () => emit(field.key, checkbox.checked);
      return checkbox;
    }
    if (field.type === 'textarea') {
      const textarea = documentRef.createElement('textarea');
      textarea.setAttribute('aria-label', field.label);
      textarea.value = Array.isArray(value) ? value.join('\n') : '';
      textarea.oninput = () => emit(
        field.key,
        textarea.value.split('\n').filter((line) => line.length > 0),
      );
      return textarea;
    }
    if (field.type === 'number') {
      return buildNumericFieldControl(
        field,
        value,
        (next) => emit(field.key, next),
        { documentRef },
      );
    }
    const text = documentRef.createElement('input');
    text.type = 'text';
    text.setAttribute('aria-label', field.label);
    text.value = String(value ?? '');
    text.oninput = () => emit(field.key, text.value);
    return text;
  }

  /**
   * Un texte de code (voir `code-field.js`) ; les erreurs que la page a remontées sont suivies tant que le formulaire est affiché.
   * @param {import('../src/layers/layer-kinds.js').FieldSchema} field @param {unknown} value @param {Emit} emit
   */
  function buildCodeField(field, value, emit) {
    const codeField = createCodeField({ documentRef, field, value, emit, ...(input.assetLibrary === undefined ? {} : { assetLibrary: input.assetLibrary }), reports: codeReports, onParamSpec: rebuildParams });
    assetCleanups.push(codeField.dispose);
    return codeField.el;
  }

  /**
   * Les réglages que le code déclare, présentés comme les champs de n'importe quelle couche. Leurs valeurs vivent dans l'option `params` ; la déclaration
   * (`paramSpec`) vient des options de la couche réglée et se relit à chaque frappe (voir `rebuildParams`).
   * @param {import('../src/layers/layer-kinds.js').FieldSchema} field @param {unknown} value @param {Emit} emit @param {Record<string, unknown>} options
   */
  function buildParamsField(field, value, emit, options) {
    const host = documentRef.createElement('div');
    host.className = 'params-field';
    paramsForm = { host, values: typeof value === 'object' && value !== null ? { .../** @type {Record<string, unknown>} */ (value) } : {} };
    paramsEmit = (values) => emit(field.key, values);
    rebuildParams(typeof options.paramSpec === 'string' ? options.paramSpec : '');
    return host;
  }

  /** @type {((values: Record<string, unknown>) => void) | null} */
  let paramsEmit = null;

  /** Reconstruit le formulaire des réglages d'après une déclaration ; les valeurs déjà réglées sont gardées pour les clés qui restent. @param {string} specText */
  function rebuildParams(specText) {
    if (paramsForm === null || paramsEmit === null) return;
    const form = paramsForm;
    const publish = paramsEmit;
    const { params } = parseParamSpec(specText);
    form.host.replaceChildren();
    if (params.length === 0) {
      const none = documentRef.createElement('p');
      none.className = 'field-help';
      none.textContent = 'Aucun réglage déclaré : ajoutez-en dans « Réglages exposés » pour les voir ici.';
      form.host.appendChild(none);
      return;
    }
    form.values = normalizeParamValues(params, form.values);
    for (const sub of paramFieldSchemas(params)) {
      const label = documentRef.createElement('label');
      label.textContent = sub.label;
      form.host.append(label, buildField(sub, form.values[sub.key], (key, next) => {
        form.values = { ...form.values, [key]: next };
        publish(form.values);
      }));
    }
  }

  return {
    /** @param {{ colors?: PaletteColor[], gradients?: PaletteGradient[] }} next */
    setPalette(next) {
      palette = {
        colors: Array.isArray(next.colors) ? next.colors : [],
        gradients: Array.isArray(next.gradients) ? next.gradients : [],
      };
    },
    /**
     * @param {string | null} component
     * @param {Record<string, unknown>} options
     * @param {{ reports?: CodeReports }} [context] ce que la couche affichée remonte (les erreurs de son code)
     */
    render(component, options, context = {}) {
      for (const cleanup of assetCleanups.splice(0)) cleanup();
      paramsForm = null;
      paramsEmit = null;
      codeReports = context.reports ?? null;
      input.container.replaceChildren();
      if (component === 'code' && input.onApply !== undefined) buildStarterRow({ documentRef, container: input.container, options, ...(input.currentOptions === undefined ? {} : { currentOptions: input.currentOptions }), apply: input.onApply });
      for (const { field, value } of backgroundFieldValues(component, options)) {
        const label = documentRef.createElement('label');
        label.textContent = field.label;
        input.container.append(label, buildField(field, value, input.onChange, options));
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
