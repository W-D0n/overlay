// @ts-check
import { createSceneRuntime } from '../scene-runtime.js';
import { sceneFromCurrent } from '../scene-doc.js';
import { ReactionOverlay } from '../components/ReactionOverlay.js';
import { createReactionCoordinator } from '../background-reactions.js';
import { createBrowserAudioSession } from '../background-audio.js';
import {
  BACKGROUND_COMPONENT_NAMES,
  backgroundEffectLabel,
} from './component-field-schemas.js';
import { createBackgroundFieldRenderer } from './background-field-renderer.js';
import { createBackgroundPreviewSession } from './background-preview-session.js';
import { createDraftTracker } from './background-draft.js';
import { parseRenderUrl } from '../render-url.js';

const NONE_VALUE = '__none__';

/**
 * @param {{
 *   layer: HTMLElement,
 *   effectSelect: HTMLSelectElement,
 *   fields: HTMLElement,
 *   presetName: HTMLInputElement,
 *   presetTags: HTMLInputElement,
 *   presetSave: HTMLButtonElement,
 *   runtimeStatus: HTMLElement,
 *   onDraftChange?: (isDraft: boolean) => void,
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
  /** @type {ReturnType<typeof createBrowserAudioSession> | null} */
  let audio = null;
  const mount = createSceneRuntime(input.layer, { onMountChange: () => audio?.sync() });
  audio = createBrowserAudioSession({ mount, onStateChange: input.onAudioStateChange });
  const overlay = ReactionOverlay();
  input.layer.appendChild(overlay.el);
  const reactions = createReactionCoordinator({ mount, overlay });
  const session = createBackgroundPreviewSession();
  const draft = createDraftTracker();
  let measuredFps = null;
  let fpsFrames = 0;
  let fpsSince = now();
  let frameId = 0;

  function createOption(label, value) {
    const option = documentRef.createElement('option');
    option.textContent = label;
    option.value = value;
    return option;
  }

  function notifyDraft() {
    input.onDraftChange?.(draft.isDraft());
  }

  /**
   * Publie l'aperçu à l'URL OBS. Une arrivée de preset part avec sa `transition` : sans ça,
   * l'instantané relu au moment de l'envoi l'aurait déjà oubliée et l'URL OBS ne recevrait jamais
   * l'animation (docs/specs/background-preset-transitions.md).
   */
  async function persistNow() {
    const { current, transition } = session.snapshot();
    const published = draft.hasArrival() ? { ...current, transition } : current;
    try {
      await input.client.saveCurrent(published);
      draft.synced(published);
      notifyDraft();
      input.report.ok();
      return true;
    } catch (error) {
      input.report.error(`state : ${error.message}`);
      return false;
    }
  }

  /** @type {{ render: (transition: *) => void } | null} */
  let transitionControls = null;
  /** @type {{ renderShowOnPreset: (visible: boolean) => void } | null} */
  let brandingControls = null;

  const fieldRenderer = createBackgroundFieldRenderer({
    container: input.fields,
    documentRef,
    onChange(key, value) {
      const state = session.changeOption(key, value);
      mount.apply(sceneFromCurrent(state.current));
      draft.edited();
      notifyDraft();
    },
  });

  function reflect(state, source = null) {
    input.presetSave.textContent = state.activePresetId === null ? 'Créer' : 'Mettre à jour';
    input.presetTags.value = Array.isArray(source?.tags) ? source.tags.join(', ') : '';
    input.effectSelect.value = state.current.component ?? NONE_VALUE;
    mount.apply(sceneFromCurrent(state.current));
    fieldRenderer.render(state.current.component, state.current.options);
  }

  /**
   * @param {*} next
   * @param {string | null} [presetId]
   * @param {boolean} [asDraft] Vrai pour un preset essayé : l'aperçu change, l'antenne attend « Publier ».
   */
  function apply(next, presetId = null, asDraft = false) {
    const state = session.apply(next, presetId);
    reflect(state, next);
    transitionControls?.render(state.transition);
    brandingControls?.renderShowOnPreset(state.showBranding);
    if (asDraft) draft.arrived(); else draft.synced(state.current);
    notifyDraft();
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
    draft.edited();
    notifyDraft();
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
        : `${measuredFps} FPS · DPR ${Math.min(windowRef.devicePixelRatio || 1, 2)}`;
      fpsFrames = 0;
      fpsSince = now;
    }
    frameId = windowRef.requestAnimationFrame(measureFps);
  }
  frameId = windowRef.requestAnimationFrame(measureFps);

  return {
    apply,
    /** Branche la case « Afficher sur ce preset » sur la session. */
    attachBrandingControls(controls) {
      brandingControls = controls;
    },
    /** Branche la section « Arrivée de ce preset » sur la session. */
    attachTransitionControls(controls) {
      transitionControls = controls;
      controls.render(session.snapshot().transition);
    },
    /** @param {Record<string, unknown>} patch */
    changeTransition(patch) {
      return session.changeTransition(patch);
    },
    /**
     * La visibilité du branding appartient au preset : elle rejoint le brouillon et part avec lui
     * à la publication, sans attendre un enregistrement de preset.
     * @param {boolean} visible
     */
    changeShowBranding(visible) {
      const state = session.setShowBranding(visible);
      draft.edited();
      notifyDraft();
      return state;
    },
    /** @param {unknown} next */
    receive(next) {
      if (!draft.shouldApplyIncoming(next)) return;
      const current = session.snapshot().current;
      if (JSON.stringify(next) === JSON.stringify(current)) return;
      apply(next);
    },
    react: reactions.handle,
    audioState: () => audio.getState(),
    snapshot: session.snapshot,
    /** @param {string | null} presetId */
    setActivePresetId(presetId) {
      const state = session.setActivePresetId(presetId);
      input.presetSave.textContent = presetId === null ? 'Créer' : 'Mettre à jour';
      return state;
    },
    setPalette: fieldRenderer.setPalette,
    /** Envoie l'aperçu à l'URL OBS. */
    publish: persistNow,
    persistNow,
    /** Remplace le brouillon par ce qui est en antenne. */
    discard() {
      const onAir = draft.published();
      if (onAir !== null) apply(onAir);
    },
    isDraft: draft.isDraft,
    runtimeMeasurement() {
      return {
        fps: measuredFps,
        pixelRatio: documentRef.hidden
          ? null
          : Math.min(windowRef.devicePixelRatio || 1, 2),
        paused: documentRef.hidden,
      };
    },
    destroy() {
      windowRef.cancelAnimationFrame(frameId);
      documentRef.removeEventListener('visibilitychange', onVisibilityChange);
      overlay.destroy();
      mount.destroy();
    },
  };
}
