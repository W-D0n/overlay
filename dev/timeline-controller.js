// @ts-check
import { BINDING_TARGETS } from '../layer-bindings.js';
import { DURATION_BOUNDS, EASES, MAX_KEYS, changeKey, removeKey, setKey } from '../layer-timeline.js';
import { describeKey, formatSeconds, percentOf, timeFromPointer, timelineOf, valueAt } from './timeline-view.js';

/**
 * dev/timeline-controller.js — Le panneau de la timeline, sous l'aperçu : lecture (lecture, pause, position, recommencer), durée et boucle de la
 * scène, et les images clés de la couche sélectionnée (`layer-timeline.js`).
 *
 * Chaque valeur animée de la couche a une **piste** ; ses images clés sont des losanges qu'on glisse (ou qu'on déplace aux flèches, `Maj` pour aller
 * dix fois plus vite), qu'on règle (instant, valeur, courbe) ou qu'on supprime. « + Image clé » en pose une au repère de lecture, avec la valeur que la
 * couche y a déjà : poser une clé ne change rien tant qu'on ne la règle pas. Se placer dans le temps met la lecture en pause : l'aperçu montre
 * cette image, et la modifier s'y voit aussitôt. Tout s'écrit par les commandes de l'éditeur (annulable, publiable, enregistrable en commande).
 *
 * @param {{
 *   elements: {
 *     panel: HTMLElement, toggle: HTMLButtonElement, play: HTMLButtonElement, restart: HTMLButtonElement, readout: HTMLElement, scrub: HTMLInputElement,
 *     duration: HTMLInputElement, loop: HTMLInputElement, title: HTMLElement, target: HTMLSelectElement, addKey: HTMLButtonElement, tracks: HTMLElement,
 *     detail: HTMLElement, detailTime: HTMLInputElement, detailValue: HTMLInputElement, detailEase: HTMLSelectElement, detailRemove: HTMLButtonElement,
 *   },
 *   studio: ReturnType<typeof import('./studio-document.js').createStudioDocument>,
 *   timeline: { state(): { playing: boolean, timeMs: number, durationMs: number, loop: 'once' | 'loop' }, play(): void, pause(): void, restart(): void, seek(ms: number): void, subscribe(listener: (state: *) => void): () => void },
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   documentRef?: Document,
 *   windowRef?: Window,
 * }} input
 */
export function createTimelineController(input) {
  const documentRef = input.documentRef ?? document;
  const windowRef = input.windowRef ?? window;
  const { elements, studio, timeline } = input;
  const { editor } = studio;
  /** @type {{ target: import('../layer-bindings.js').BindingTarget, index: number } | null} */
  let selected = null;
  let selectedLayerId = '';

  /** @returns {import('../scene-doc.js').Layer | null} la couche réglée : la seule sélectionnée */
  function layer() {
    const { selection } = editor.state();
    const layers = studio.state().scene.layers.filter((candidate) => selection.includes(candidate.id));
    return layers.length === 1 ? layers[0] : null;
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

  /** @param {HTMLInputElement | HTMLSelectElement} field @param {string} value */
  function show(field, value) {
    if (documentRef.activeElement !== field) field.value = value;
  }

  /** @param {import('../layer-timeline.js').Track[]} tracks @param {string} key */
  function commitTracks(tracks, key) {
    const target = layer();
    if (target === null) return;
    settle(editor.setLayers([target.id], { timeline: tracks }, { coalesceKey: `timeline:${target.id}:${key}` }));
  }

  /** @param {Partial<import('../layer-timeline.js').SceneTimeline>} change */
  function commitScene(change) {
    const current = timelineOf(studio.state().scene);
    settle(editor.setSceneProps({ timeline: { ...current, ...change } }, { coalesceKey: 'timeline-scene' }));
  }

  // ── Affichage ───────────────────────────────────────────────────────────

  /** Remet le repère de lecture de chaque piste. @param {{ timeMs: number, durationMs: number }} state */
  function placePlayheads(state) {
    for (const head of elements.tracks.querySelectorAll('.tl-playhead')) /** @type {HTMLElement} */ (head).style.left = `${percentOf(state.timeMs, state.durationMs)}%`;
  }

  /** @param {{ playing: boolean, timeMs: number, durationMs: number }} state */
  function renderPlayback(state) {
    elements.readout.textContent = `${formatSeconds(state.timeMs)} / ${formatSeconds(state.durationMs)}`;
    elements.scrub.max = String(state.durationMs);
    show(elements.scrub, String(Math.round(state.timeMs)));
    elements.play.textContent = state.playing ? '⏸' : '▶';
    elements.play.setAttribute('aria-label', state.playing ? 'Pause' : 'Lecture');
    elements.play.setAttribute('aria-pressed', String(state.playing));
    placePlayheads(state);
  }

  function renderTracks() {
    const target = layer();
    const scene = studio.state().scene;
    const settings = timelineOf(scene);
    if (target?.id !== selectedLayerId) {
      selected = null;
      selectedLayerId = target?.id ?? '';
    }
    show(elements.duration, String(settings.durationMs / 1000));
    elements.loop.checked = settings.loop === 'loop';
    elements.addKey.disabled = target === null;
    elements.title.textContent = target === null ? 'Sélectionnez une couche pour l’animer.' : `Animation de « ${target.name ?? target.kind} »`;
    elements.tracks.replaceChildren();
    const tracks = target?.timeline ?? [];
    for (const track of tracks) {
      const range = BINDING_TARGETS[track.target];
      const lane = node('div', 'tl-track');
      lane.setAttribute('role', 'group');
      lane.setAttribute('aria-label', `Piste ${range.label.toLowerCase()}`);
      lane.dataset.target = track.target;
      const label = node('span', 'tl-label', range.label);
      const area = node('div', 'tl-lane');
      area.dataset.target = track.target;
      area.addEventListener('pointerdown', (event) => {
        if (/** @type {HTMLElement} */ (event.target).closest('.tl-key') !== null) return;
        timeline.seek(timeFromPointer(event.clientX, area.getBoundingClientRect(), settings.durationMs));
      });
      track.keys.forEach((key, index) => {
        const button = /** @type {HTMLButtonElement} */ (node('button', 'tl-key'));
        button.type = 'button';
        button.dataset.index = String(index);
        button.style.left = `${percentOf(key.t, settings.durationMs)}%`;
        button.setAttribute('aria-label', describeKey(track.target, key));
        button.setAttribute('aria-pressed', String(selected?.target === track.target && selected.index === index));
        button.addEventListener('pointerdown', (event) => startDrag(event, target, track.target, index, area));
        button.addEventListener('keydown', (event) => onKeyKey(event, track.target, index));
        button.addEventListener('click', () => select(track.target, index));
        area.appendChild(button);
      });
      area.appendChild(node('span', 'tl-playhead'));
      lane.append(label, area);
      elements.tracks.appendChild(lane);
    }
    if (tracks.length === 0 && target !== null) elements.tracks.appendChild(node('p', 'hint tl-empty', 'Aucune image clé : placez le repère, choisissez une valeur et posez une première image clé.'));
    renderDetail();
    placePlayheads(timeline.state());
  }

  function renderDetail() {
    const target = layer();
    const track = selected === null ? undefined : target?.timeline?.find((candidate) => candidate.target === selected?.target);
    const key = selected === null ? undefined : track?.keys[selected.index];
    elements.detail.hidden = key === undefined;
    if (key === undefined || selected === null) return;
    const range = BINDING_TARGETS[selected.target];
    elements.detail.dataset.target = selected.target;
    show(elements.detailTime, String(key.t));
    show(elements.detailValue, String(key.v));
    elements.detailValue.min = String(range.min);
    elements.detailValue.max = String(range.max);
    elements.detailValue.step = String(range.step);
    elements.detailValue.setAttribute('aria-label', `Valeur de l’image clé (${range.label.toLowerCase()}${range.unit === '' ? '' : `, ${range.unit}`})`);
    show(elements.detailEase, key.ease);
  }

  // ── Images clés ─────────────────────────────────────────────────────────

  /** @param {import('../layer-bindings.js').BindingTarget} target @param {number} index */
  function select(target, index) {
    selected = { target, index };
    renderTracks();
  }

  /** Glisser une image clé : l'instant suit le pointeur (à 10 ms), l'aperçu se place sur cet instant. */
  function startDrag(/** @type {PointerEvent} */ event, /** @type {import('../scene-doc.js').Layer | null} */ owner, /** @type {import('../layer-bindings.js').BindingTarget} */ target, /** @type {number} */ index, /** @type {HTMLElement} */ area) {
    if (owner === null || event.button !== 0) return;
    event.preventDefault();
    let current = index;
    select(target, current);
    const move = (/** @type {PointerEvent} */ moveEvent) => {
      const live = layer();
      if (live === null) return;
      // La piste est relue à chaque mouvement : l'affichage a pu être reconstruit depuis le début du glisser (la clé choisie change d'aspect).
      const lane = elements.tracks.querySelector(`.tl-lane[data-target="${target}"]`) ?? area;
      const t = timeFromPointer(moveEvent.clientX, lane.getBoundingClientRect(), timelineOf(studio.state().scene).durationMs);
      const result = changeKey(live.timeline ?? [], target, current, { t });
      // Passer sur une autre image clé est refusé : la clé reste où elle était, le pointeur reprend la main plus loin.
      if (result.refused) return;
      current = result.index;
      selected = { target, index: current };
      commitTracks(result.tracks, `drag:${target}`);
      timeline.seek(t);
    };
    const stop = () => {
      windowRef.removeEventListener('pointermove', move);
      windowRef.removeEventListener('pointerup', stop);
      windowRef.removeEventListener('pointercancel', stop);
    };
    windowRef.addEventListener('pointermove', move);
    windowRef.addEventListener('pointerup', stop);
    windowRef.addEventListener('pointercancel', stop);
  }

  /** @param {KeyboardEvent} event @param {import('../layer-bindings.js').BindingTarget} target @param {number} index */
  function onKeyKey(event, target, index) {
    const live = layer();
    if (live === null) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const key = live.timeline?.find((track) => track.target === target)?.keys[index];
      if (key === undefined) return;
      const result = changeKey(live.timeline ?? [], target, index, { t: key.t + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 100 : 10) });
      if (result.refused) return;
      selected = { target, index: result.index };
      commitTracks(result.tracks, `move:${target}`);
      renderTracks();
      /** @type {HTMLElement | null} */ (elements.tracks.querySelector(`.tl-track[data-target="${target}"] .tl-key[data-index="${result.index}"]`))?.focus();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeSelected(target, index);
    }
  }

  /** @param {import('../layer-bindings.js').BindingTarget} target @param {number} index */
  function removeSelected(target, index) {
    const live = layer();
    if (live === null) return;
    selected = null;
    commitTracks(removeKey(live.timeline ?? [], target, index), `remove:${target}`);
    renderTracks();
  }

  elements.addKey.addEventListener('click', () => {
    const live = layer();
    if (live === null) return;
    const target = /** @type {import('../layer-bindings.js').BindingTarget} */ (elements.target.value);
    const t = Math.round(timeline.state().timeMs);
    const tracks = setKey(live.timeline ?? [], target, t, valueAt(live, target, t));
    if (tracks === null) {
      input.report.error(`limite atteinte : ${MAX_KEYS} images clés par piste, une piste par valeur`);
      return;
    }
    commitTracks(tracks, `add:${target}:${t}`);
    const index = tracks.find((track) => track.target === target)?.keys.findIndex((key) => key.t === t) ?? 0;
    select(target, index);
  });

  /** Le détail de l'image clé choisie : instant, valeur, courbe. @param {{ t?: number, v?: number, ease?: import('../layer-timeline.js').Ease }} change @param {string} key */
  function changeSelected(change, key) {
    const live = layer();
    if (live === null || selected === null) return;
    const before = live.timeline ?? [];
    const result = changeKey(before, selected.target, selected.index, change);
    if (result.refused) {
      input.report.error('une image clé existe déjà à cet instant');
      renderTracks();
      return;
    }
    selected = { target: selected.target, index: result.index };
    commitTracks(result.tracks, `detail:${selected.target}:${key}`);
    renderTracks();
  }
  elements.detailTime.addEventListener('input', () => { const t = Number.parseFloat(elements.detailTime.value); if (Number.isFinite(t)) changeSelected({ t }, 't'); });
  elements.detailValue.addEventListener('input', () => { const v = Number.parseFloat(elements.detailValue.value.replace(',', '.')); if (Number.isFinite(v)) changeSelected({ v }, 'v'); });
  elements.detailEase.addEventListener('change', () => changeSelected({ ease: /** @type {import('../layer-timeline.js').Ease} */ (elements.detailEase.value) }, 'ease'));
  elements.detailTime.addEventListener('blur', renderTracks);
  elements.detailValue.addEventListener('blur', renderTracks);
  elements.detailRemove.addEventListener('click', () => { if (selected !== null) removeSelected(selected.target, selected.index); });

  // ── Lecture, durée, boucle ──────────────────────────────────────────────

  elements.play.addEventListener('click', () => {
    const state = timeline.state();
    if (state.playing) timeline.pause();
    else if (state.loop === 'once' && state.timeMs >= state.durationMs) timeline.restart();
    else timeline.play();
    renderPlayback(timeline.state());
  });
  elements.restart.addEventListener('click', () => { timeline.restart(); renderPlayback(timeline.state()); });
  elements.scrub.addEventListener('input', () => { timeline.seek(Number(elements.scrub.value)); renderPlayback(timeline.state()); });
  elements.duration.addEventListener('input', () => {
    const seconds = Number.parseFloat(elements.duration.value.replace(',', '.'));
    if (Number.isFinite(seconds)) commitScene({ durationMs: Math.min(DURATION_BOUNDS.max, Math.max(DURATION_BOUNDS.min, Math.round(seconds * 1000))) });
  });
  elements.duration.addEventListener('blur', renderTracks);
  elements.loop.addEventListener('change', () => commitScene({ loop: elements.loop.checked ? 'loop' : 'once' }));
  elements.toggle.addEventListener('click', () => {
    const open = elements.panel.dataset.open !== 'true';
    elements.panel.dataset.open = String(open);
    elements.toggle.setAttribute('aria-expanded', String(open));
  });

  for (const [id, range] of Object.entries(BINDING_TARGETS)) {
    const option = /** @type {HTMLOptionElement} */ (node('option', undefined, range.label));
    option.value = id;
    elements.target.appendChild(option);
  }
  for (const ease of EASES) {
    const option = /** @type {HTMLOptionElement} */ (node('option', undefined, ease.label));
    option.value = ease.id;
    elements.detailEase.appendChild(option);
  }

  studio.subscribe(renderTracks);
  const stop = timeline.subscribe(renderPlayback);
  renderTracks();
  renderPlayback(timeline.state());

  return { render: renderTracks, destroy: stop };
}
