// @ts-check
import { ANIMATION_EASES, AFTER_LIMITS, AMOUNT_LIMITS, DELAY_LIMITS, DURATION_LIMITS, LOOPS, PERIOD_LIMITS, PRESETS, changePhase, setPhase, toggleRestart } from '../layer-animation.js';
import { RESTART_SOURCES } from '../layer-timeline.js';

/**
 * dev/animation-controller.js — La section « Entrée, boucle, sortie » de l'inspecteur : l'animation de la couche sélectionnée (`layer-animation.js`).
 *
 * Trois phases, chacune un préréglage à choisir (ou « Aucune ») et ses réglages ; les alertes qui rejouent l'animation de cette couche ; un bouton qui la rejoue.
 * Elle écrit par les commandes de l'éditeur, donc annulable. Une seule couche à la fois. La structure est construite une fois ; l'affichage ne réécrit jamais un
 * champ en cours de saisie. Voir docs/specs/animations-de-couche.md.
 *
 * @param {{
 *   elements: { body: HTMLElement, hint: HTMLElement, replay: HTMLButtonElement },
 *   studio: ReturnType<typeof import('./studio-document.js').createStudioDocument>,
 *   timeline: { restart: () => void },
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   documentRef?: Document,
 * }} input
 */
export function createAnimationController(input) {
  const documentRef = input.documentRef ?? document;
  const { elements, studio } = input;
  const { editor } = studio;

  /** @typedef {'enter' | 'loop' | 'exit'} Phase */
  /** @type {readonly { phase: Phase, label: string, presets: readonly { id: string, label: string }[] }[]} */
  const PHASES = [
    { phase: 'enter', label: 'Entrée', presets: PRESETS },
    { phase: 'loop', label: 'Boucle', presets: LOOPS },
    { phase: 'exit', label: 'Sortie', presets: PRESETS },
  ];
  /** Les réglages de chaque phase : un nombre, ou une courbe. `empty` : un champ vide retire la valeur. */
  /** @type {Record<Phase, { field: string, label: string, kind: 'number' | 'ease', limits?: { min: number, max: number }, step?: number, empty?: boolean }[]>} */
  const FIELDS = {
    enter: [
      { field: 'durationMs', label: 'Durée (ms)', kind: 'number', limits: DURATION_LIMITS, step: 50 },
      { field: 'delayMs', label: 'Retard (ms)', kind: 'number', limits: DELAY_LIMITS, step: 50, empty: true },
      { field: 'ease', label: 'Courbe', kind: 'ease' },
    ],
    loop: [
      { field: 'periodMs', label: 'Période (ms)', kind: 'number', limits: PERIOD_LIMITS, step: 100 },
      { field: 'amount', label: 'Amplitude (×)', kind: 'number', limits: AMOUNT_LIMITS, step: 0.1, empty: true },
    ],
    exit: [
      { field: 'durationMs', label: 'Durée (ms)', kind: 'number', limits: DURATION_LIMITS, step: 50 },
      { field: 'afterMs', label: 'Après (ms), vide = jamais', kind: 'number', limits: AFTER_LIMITS, step: 500, empty: true },
      { field: 'ease', label: 'Courbe', kind: 'ease' },
    ],
  };

  /** @param {string} tag @param {string} [className] @param {string} [text] */
  function node(tag, className, text) {
    const el = documentRef.createElement(tag);
    if (className !== undefined) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  /** @returns {import('../scene-doc.js').Layer | undefined} la couche sélectionnée, quand il n'y en a qu'une */
  function selectedLayer() {
    const { selection } = editor.state();
    if (selection.length !== 1) return undefined;
    return studio.state().scene.layers.find((layer) => layer.id === selection[0]);
  }

  /** @param {{ ok: boolean, message?: string }} result */
  function settle(result) {
    if (!result.ok && result.message !== undefined) input.report.error(result.message);
  }

  /** @param {string} id @param {import('../layer-animation.js').Animation | undefined} next @param {string} key */
  function commit(id, next, key) {
    settle(editor.setLayers([id], { animation: next ?? {} }, { coalesceKey: `animation:${id}:${key}` }));
  }

  /** L'animation de la couche **maintenant** : les contrôles construits une fois survivent aux modifications. @returns {{ id: string, animation: import('../layer-animation.js').Animation | undefined } | null} */
  function live() {
    const layer = selectedLayer();
    return layer === undefined ? null : { id: layer.id, animation: layer.animation };
  }

  /** @param {HTMLInputElement | HTMLSelectElement} field @param {string} value */
  function show(field, value) {
    if (documentRef.activeElement !== field) field.value = value;
  }

  /** @type {Record<string, { section: HTMLElement, preset: HTMLSelectElement, fields: HTMLElement, controls: Map<string, HTMLInputElement | HTMLSelectElement> }>} */
  const phases = {};

  for (const { phase, label, presets } of PHASES) {
    const section = node('div', 'animation-phase');
    section.dataset.phase = phase;
    section.setAttribute('role', 'group');
    section.setAttribute('aria-label', label);

    const choice = node('label', 'animation-choice');
    choice.appendChild(node('span', undefined, label));
    const preset = /** @type {HTMLSelectElement} */ (node('select'));
    preset.dataset.field = 'preset';
    preset.setAttribute('aria-label', `${label} : préréglage`);
    const none = /** @type {HTMLOptionElement} */ (node('option', undefined, 'Aucune'));
    none.value = '';
    preset.appendChild(none);
    for (const option of presets) {
      const el = /** @type {HTMLOptionElement} */ (node('option', undefined, option.label));
      el.value = option.id;
      preset.appendChild(el);
    }
    preset.addEventListener('change', () => {
      const current = live();
      if (current !== null) commit(current.id, setPhase(current.animation, phase, preset.value === '' ? null : preset.value), `${phase}:preset`);
    });
    choice.appendChild(preset);
    section.appendChild(choice);

    const fields = node('div', 'animation-fields');
    /** @type {Map<string, HTMLInputElement | HTMLSelectElement>} */
    const controls = new Map();
    for (const spec of FIELDS[phase]) {
      const wrap = node('label', 'animation-field');
      wrap.appendChild(node('span', undefined, spec.label));
      if (spec.kind === 'ease') {
        const select = /** @type {HTMLSelectElement} */ (node('select'));
        select.dataset.field = spec.field;
        select.setAttribute('aria-label', `${label} : courbe`);
        const same = /** @type {HTMLOptionElement} */ (node('option', undefined, 'Celle du préréglage'));
        same.value = '';
        select.appendChild(same);
        for (const ease of ANIMATION_EASES) {
          const el = /** @type {HTMLOptionElement} */ (node('option', undefined, ease.label));
          el.value = ease.id;
          select.appendChild(el);
        }
        select.addEventListener('change', () => {
          const current = live();
          if (current !== null) commit(current.id, changePhase(current.animation, phase, spec.field, select.value === '' ? null : select.value), `${phase}:${spec.field}`);
        });
        wrap.appendChild(select);
        controls.set(spec.field, select);
      } else {
        const el = /** @type {HTMLInputElement} */ (node('input'));
        el.type = 'number';
        el.min = String(spec.limits?.min ?? '');
        el.max = String(spec.limits?.max ?? '');
        el.step = String(spec.step ?? 1);
        el.dataset.field = spec.field;
        el.setAttribute('aria-label', `${label} : ${spec.label}`);
        el.addEventListener('input', () => {
          const current = live();
          if (current === null) return;
          const typed = el.value.trim() === '' ? null : Number.parseFloat(el.value.replace(',', '.'));
          if (typed !== null && !Number.isFinite(typed)) return;
          if (typed === null && spec.empty !== true) return;
          commit(current.id, changePhase(current.animation, phase, spec.field, typed), `${phase}:${spec.field}`);
        });
        el.addEventListener('blur', render);
        wrap.appendChild(el);
        controls.set(spec.field, el);
      }
      fields.appendChild(wrap);
    }
    if (phase === 'exit') {
      const wrap = node('label', 'animation-field animation-check');
      const box = /** @type {HTMLInputElement} */ (node('input'));
      box.type = 'checkbox';
      box.dataset.field = 'onLeave';
      box.setAttribute('aria-label', 'Sortie : quand la scène part');
      box.addEventListener('change', () => {
        const current = live();
        if (current === null) return;
        commit(current.id, changePhase(current.animation, 'exit', 'onLeave', box.checked), 'exit:onLeave');
        // Sans instant ni départ, la sortie n'aurait aucun déclencheur : la case reste cochée.
        render();
      });
      wrap.append(box, node('span', undefined, 'Quand la scène part'));
      fields.appendChild(wrap);
      controls.set('onLeave', box);
    }
    section.appendChild(fields);
    elements.body.appendChild(section);
    phases[phase] = { section, preset, fields, controls };
  }

  const restart = node('div', 'animation-restart');
  restart.setAttribute('role', 'group');
  restart.setAttribute('aria-labelledby', 'animation-restart-label');
  const restartLabel = node('span', 'animation-restart-label', 'Rejouer quand arrive');
  restartLabel.id = 'animation-restart-label';
  restart.appendChild(restartLabel);
  /** @type {HTMLInputElement[]} */
  const restartBoxes = RESTART_SOURCES.map(({ id, label }) => {
    const box = /** @type {HTMLInputElement} */ (node('input'));
    box.type = 'checkbox';
    box.value = id;
    box.dataset.source = id;
    const wrap = node('label', 'animation-field animation-check');
    wrap.append(box, node('span', undefined, label));
    restart.appendChild(wrap);
    box.addEventListener('change', () => {
      const current = live();
      if (current !== null) commit(current.id, toggleRestart(current.animation, id), `restart:${id}`);
    });
    return box;
  });
  elements.body.appendChild(restart);

  elements.replay.addEventListener('click', () => input.timeline.restart());

  function render() {
    const layer = selectedLayer();
    const { selection } = editor.state();
    elements.body.hidden = layer === undefined;
    elements.replay.disabled = layer === undefined;
    elements.hint.textContent = selection.length === 0 ? '' : layer === undefined
      ? 'Sélectionnez une seule couche pour régler son entrée, sa boucle et sa sortie.'
      : layer.animation === undefined
        ? 'Faites entrer la couche, animez-la en continu, puis faites-la sortir : elle a sa propre horloge, qui part quand elle apparaît.'
        : 'L’entrée joue une fois, la boucle ensuite sans fin, la sortie à l’instant voulu ou quand la scène part.';
    if (layer === undefined) return;
    const { animation } = layer;
    for (const { phase } of PHASES) {
      const state = phases[phase];
      const current = animation?.[phase];
      show(state.preset, current === undefined ? '' : current.preset);
      state.fields.hidden = current === undefined;
      for (const [field, control] of state.controls) {
        const value = current === undefined ? undefined : /** @type {Record<string, unknown>} */ (current)[field];
        if (field === 'onLeave') /** @type {HTMLInputElement} */ (control).checked = value === true;
        else show(control, value === undefined ? '' : String(value));
      }
    }
    const hasPhase = animation !== undefined && (animation.enter !== undefined || animation.loop !== undefined || animation.exit !== undefined);
    restart.hidden = !hasPhase;
    for (const box of restartBoxes) box.checked = (animation?.restartOn ?? []).includes(box.value);
  }

  studio.subscribe(render);
  render();

  return { render };
}
