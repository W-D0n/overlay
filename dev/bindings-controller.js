// @ts-check
import { BINDING_SOURCES, BINDING_TARGETS, DURATION_LIMITS, MAX_BINDINGS, addBinding, changeBinding, isContinuousSource, removeBinding } from '../layer-bindings.js';

/**
 * dev/bindings-controller.js — La section « Animation » de l'inspecteur : les liaisons de la couche sélectionnée (`layer-bindings.js`).
 *
 * Chaque liaison est une ligne : la source (le son, une alerte), la valeur qu'elle pilote, ses deux bornes « de » (au repos) et « à » (à
 * pleine source) et une durée (lissage du son, ou retombée d'une alerte). Elle écrit par les commandes de l'éditeur, donc annulable
 * et enregistrable en commande. Une seule couche à la fois : sur plusieurs couches, la section le dit et ne propose rien. Un champ en
 * cours de saisie n'est jamais réécrit par l'affichage ; la structure (nombre de lignes, source, valeur) ne se reconstruit que si elle
 * a changé.
 *
 * @param {{
 *   elements: { list: HTMLElement, add: HTMLButtonElement, hint: HTMLElement },
 *   studio: ReturnType<typeof import('./studio-document.js').createStudioDocument>,
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   documentRef?: Document,
 * }} input
 */
export function createBindingsController(input) {
  const documentRef = input.documentRef ?? document;
  const { elements, studio } = input;
  const { editor } = studio;
  /** La structure affichée : change quand une ligne apparaît, disparaît ou change de source ou de valeur. */
  let shownKey = '';

  /** @returns {import('../scene-doc.js').Layer[]} */
  function selected() {
    const { selection } = editor.state();
    return studio.state().scene.layers.filter((layer) => selection.includes(layer.id));
  }

  /** @param {{ ok: boolean, message?: string }} result */
  function settle(result) {
    if (!result.ok && result.message !== undefined) input.report.error(result.message);
  }

  /** @param {string} tag @param {string} [className] @param {string} [text] */
  function node(tag, className, text) {
    const el = documentRef.createElement(tag);
    if (className !== undefined) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  /** @param {import('../scene-doc.js').Layer} layer @param {import('../layer-bindings.js').Binding[]} next @param {string} key */
  function commit(layer, next, key) {
    settle(editor.setLayers([layer.id], { bindings: next }, { coalesceKey: `bindings:${layer.id}:${key}` }));
  }

  /** @param {HTMLInputElement | HTMLSelectElement} field @param {string} value */
  function show(field, value) {
    if (documentRef.activeElement !== field) field.value = value;
  }

  /** Les liaisons d'une couche **maintenant** : les lignes affichées survivent à plusieurs modifications. @param {string} id @returns {import('../layer-bindings.js').Binding[]} */
  function live(id) {
    return studio.state().scene.layers.find((layer) => layer.id === id)?.bindings ?? [];
  }

  /** @param {import('../scene-doc.js').Layer} layer */
  function build(layer) {
    const bindings = layer.bindings ?? [];
    elements.list.replaceChildren();
    bindings.forEach((binding, index) => {
      const row = node('div', 'binding-row');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', `Liaison ${index + 1}`);
      row.dataset.index = String(index);

      const source = /** @type {HTMLSelectElement} */ (node('select'));
      source.dataset.field = 'source';
      source.setAttribute('aria-label', `Liaison ${index + 1} : source`);
      for (const option of BINDING_SOURCES) {
        const el = /** @type {HTMLOptionElement} */ (node('option', undefined, option.label));
        el.value = option.id;
        source.appendChild(el);
      }
      source.addEventListener('change', () => commit(layer, changeBinding(live(layer.id), index, 'source', source.value), `${index}:source`));

      const target = /** @type {HTMLSelectElement} */ (node('select'));
      target.dataset.field = 'target';
      target.setAttribute('aria-label', `Liaison ${index + 1} : valeur pilotée`);
      for (const [id, range] of Object.entries(BINDING_TARGETS)) {
        const el = /** @type {HTMLOptionElement} */ (node('option', undefined, range.label));
        el.value = id;
        // Une valeur déjà pilotée par une autre liaison ne se propose pas deux fois.
        el.disabled = bindings.some((other, at) => at !== index && other.target === id);
        target.appendChild(el);
      }
      target.addEventListener('change', () => commit(layer, changeBinding(live(layer.id), index, 'target', target.value), `${index}:target`));

      const range = BINDING_TARGETS[binding.target];
      /** @param {'from' | 'to' | 'durationMs'} field @param {string} label @param {number} min @param {number} max @param {number} step */
      const number = (field, label, min, max, step) => {
        const wrap = node('label', 'binding-number');
        const caption = node('span', undefined, label);
        const el = /** @type {HTMLInputElement} */ (node('input'));
        el.type = 'number';
        el.min = String(min);
        el.max = String(max);
        el.step = String(step);
        el.dataset.field = field;
        el.setAttribute('aria-label', `Liaison ${index + 1} : ${label}`);
        el.addEventListener('input', () => {
          const typed = Number.parseFloat(el.value.replace(',', '.'));
          if (!Number.isFinite(typed)) return;
          commit(layer, changeBinding(live(layer.id), index, field, typed), `${index}:${field}`);
        });
        el.addEventListener('blur', render);
        wrap.append(caption, el);
        return wrap;
      };
      const continuous = isContinuousSource(binding.source);
      const remove = /** @type {HTMLButtonElement} */ (node('button', 'binding-remove', '×'));
      remove.type = 'button';
      remove.title = 'Retirer la liaison';
      remove.setAttribute('aria-label', `Retirer la liaison ${index + 1}`);
      remove.addEventListener('click', () => commit(layer, removeBinding(live(layer.id), index), `remove:${index}`));
      row.append(
        source, target,
        number('from', `De (repos)${range.unit === '' ? '' : ` ${range.unit}`}`, range.min, range.max, range.step),
        number('to', `À (source au maximum)${range.unit === '' ? '' : ` ${range.unit}`}`, range.min, range.max, range.step),
        number('durationMs', continuous ? 'Lissage (ms)' : 'Retombée (ms)', DURATION_LIMITS.min, DURATION_LIMITS.max, 10),
        remove,
      );
      elements.list.appendChild(row);
    });
  }

  function render() {
    const layers = selected();
    const [layer] = layers;
    const single = layers.length === 1;
    elements.add.disabled = !single || (layer.bindings?.length ?? 0) >= MAX_BINDINGS;
    elements.hint.textContent = layers.length === 0 ? '' : single
      ? ((layer.bindings?.length ?? 0) === 0
        ? 'Faites réagir la couche au son ou aux alertes : son échelle, son opacité, sa rotation, son flou ou sa position.'
        : 'Au repos, chaque valeur est celle de « De » ; la source la fait aller vers « À ».')
      : 'Sélectionnez une seule couche pour régler ses liaisons.';
    if (!single) {
      shownKey = '';
      elements.list.replaceChildren();
      return;
    }
    const bindings = layer.bindings ?? [];
    const key = `${layer.id}|${bindings.map((binding) => `${binding.source}>${binding.target}`).join(',')}`;
    if (key !== shownKey) {
      shownKey = key;
      build(layer);
    }
    bindings.forEach((binding, index) => {
      const row = elements.list.children[index];
      if (row === undefined) return;
      show(/** @type {HTMLSelectElement} */ (row.querySelector('[data-field="source"]')), binding.source);
      show(/** @type {HTMLSelectElement} */ (row.querySelector('[data-field="target"]')), binding.target);
      for (const field of /** @type {const} */ (['from', 'to', 'durationMs'])) show(/** @type {HTMLInputElement} */ (row.querySelector(`[data-field="${field}"]`)), String(binding[field]));
    });
  }

  elements.add.addEventListener('click', () => {
    const [layer] = selected();
    if (selected().length !== 1) return;
    const next = addBinding(layer.bindings ?? []);
    if (next === null) {
      input.report.error(`${MAX_BINDINGS} liaisons au plus par couche`);
      return;
    }
    commit(layer, next, `add:${next.length}`);
  });

  studio.subscribe(render);
  render();

  return { render };
}
