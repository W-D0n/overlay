// @ts-check
import { createBackgroundMount } from '../background-mount.js';
import {
  BACKGROUND_COMPONENT_NAMES,
  backgroundEffectLabel,
} from './component-field-schemas.js';
import { createBackgroundFieldRenderer } from './background-field-renderer.js';
import { createBackgroundPreviewSession } from './background-preview-session.js';

const NONE_VALUE = '__none__';

/**
 * @param {{
 *   layer: HTMLElement,
 *   effectSelect: HTMLSelectElement,
 *   fields: HTMLElement,
 *   presetName: HTMLInputElement,
 *   presetTags: HTMLInputElement,
 *   presetSave: HTMLButtonElement,
 *   qualitySelect: HTMLSelectElement,
 *   runtimeStatus: HTMLElement,
 *   client: ReturnType<typeof import('./background-state-client.js').createBackgroundStateClient>,
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   documentRef?: Document,
 *   windowRef?: Window,
 *   now?: () => number,
 * }} input
 */
export function createBackgroundPreviewController(input) {
  const documentRef = input.documentRef ?? document;
  const windowRef = input.windowRef ?? window;
  const now = input.now ?? (() => windowRef.performance.now());
  const mount = createBackgroundMount(input.layer);
  const session = createBackgroundPreviewSession();
  let measuredFps = null;
  let postTimer = 0;
  let fpsFrames = 0;
  let fpsSince = now();
  let frameId = 0;

  function createOption(label, value) {
    const option = documentRef.createElement('option');
    option.textContent = label;
    option.value = value;
    return option;
  }

  async function persistNow() {
    try {
      await input.client.saveCurrent(session.snapshot().current);
      input.report.ok();
      return true;
    } catch (error) {
      input.report.error(`state : ${error.message}`);
      return false;
    }
  }

  function schedulePersist() {
    windowRef.clearTimeout(postTimer);
    postTimer = windowRef.setTimeout(persistNow, 150);
  }

  const fieldRenderer = createBackgroundFieldRenderer({
    container: input.fields,
    documentRef,
    onChange(key, value) {
      const state = session.changeOption(key, value);
      mount.apply(state.current);
      schedulePersist();
    },
  });

  function reflect(state, source = null) {
    input.presetSave.textContent = state.activePresetId === null ? 'Créer' : 'Mettre à jour';
    input.presetTags.value = Array.isArray(source?.tags) ? source.tags.join(', ') : '';
    input.effectSelect.value = state.current.component ?? NONE_VALUE;
    mount.apply(state.current);
    fieldRenderer.render(state.current.component, state.current.options);
  }

  function apply(next, presetId = null, persist = false) {
    const state = session.apply(next, presetId);
    reflect(state, next);
    if (persist) schedulePersist();
    return state;
  }

  input.effectSelect.appendChild(createOption('(aucun)', NONE_VALUE));
  for (const name of BACKGROUND_COMPONENT_NAMES) {
    input.effectSelect.appendChild(createOption(backgroundEffectLabel(name), name));
  }
  input.effectSelect.onchange = () => {
    const component = input.effectSelect.value === NONE_VALUE ? null : input.effectSelect.value;
    const state = session.selectEffect(component);
    input.presetName.value = '';
    input.presetTags.value = '';
    reflect(state);
    schedulePersist();
  };

  const pageParams = new URLSearchParams(windowRef.location.search);
  input.qualitySelect.value = pageParams.get('quality') === 'performance' ? 'performance' : 'auto';
  input.qualitySelect.onchange = () => {
    const next = new URL(windowRef.location.href);
    if (input.qualitySelect.value === 'performance') {
      next.searchParams.set('quality', 'performance');
    } else {
      next.searchParams.delete('quality');
    }
    windowRef.location.replace(next);
  };

  function onVisibilityChange() {
    mount.setPaused(documentRef.hidden);
    if (documentRef.hidden) {
      measuredFps = null;
      input.runtimeStatus.textContent = 'en pause';
    }
  }
  documentRef.addEventListener('visibilitychange', onVisibilityChange);
  mount.setPaused(documentRef.hidden);

  function measureFps(now) {
    fpsFrames += 1;
    if (now - fpsSince >= 1000) {
      measuredFps = Math.round((fpsFrames * 1000) / (now - fpsSince));
      input.runtimeStatus.textContent = documentRef.hidden
        ? 'en pause'
        : `${measuredFps} FPS · DPR ${quality() === 'performance' ? '1' : Math.min(windowRef.devicePixelRatio || 1, 2)}`;
      fpsFrames = 0;
      fpsSince = now;
    }
    frameId = windowRef.requestAnimationFrame(measureFps);
  }
  frameId = windowRef.requestAnimationFrame(measureFps);

  function quality() {
    return input.qualitySelect.value === 'performance' ? 'performance' : 'auto';
  }

  return {
    apply,
    /** @param {unknown} next */
    receive(next) {
      const current = session.snapshot().current;
      if (JSON.stringify(next) === JSON.stringify(current)) return;
      apply(next);
    },
    snapshot: session.snapshot,
    /** @param {string | null} presetId */
    setActivePresetId(presetId) {
      const state = session.setActivePresetId(presetId);
      input.presetSave.textContent = presetId === null ? 'Créer' : 'Mettre à jour';
      return state;
    },
    setPalette: fieldRenderer.setPalette,
    persistNow,
    schedulePersist,
    quality,
    runtimeMeasurement() {
      return {
        fps: measuredFps,
        pixelRatio: documentRef.hidden
          ? null
          : (quality() === 'performance' ? 1 : Math.min(windowRef.devicePixelRatio || 1, 2)),
        paused: documentRef.hidden,
      };
    },
    focusEffect() {
      input.effectSelect.focus();
      input.effectSelect.scrollIntoView({ block: 'center' });
    },
    destroy() {
      windowRef.clearTimeout(postTimer);
      windowRef.cancelAnimationFrame(frameId);
      documentRef.removeEventListener('visibilitychange', onVisibilityChange);
      mount.destroy();
    },
  };
}
