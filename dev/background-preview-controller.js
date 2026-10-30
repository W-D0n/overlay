// @ts-check
import { createSceneRuntime } from '../scene-runtime.js';
import { isIdentityKind } from '../layer-kinds.js';
import { ReactionOverlay } from '../components/ReactionOverlay.js';
import { createReactionCoordinator } from '../background-reactions.js';
import { createBrowserAudioSession } from '../background-audio.js';
import { normalizeTransition } from '../background-transition.js';
import { liveSceneOf } from '../background-selection.js';
import {
  BACKGROUND_COMPONENT_NAMES,
  backgroundEffectLabel,
  defaultBackgroundOptions,
} from './component-field-schemas.js';
import { createBackgroundFieldRenderer } from './background-field-renderer.js';
import { createStudioDocument } from './studio-document.js';
import { viewScene } from './scene-editor.js';
import { sceneFromCurrent } from '../scene-doc.js';

const NONE_VALUE = '__none__';

/**
 * La couche que le panneau d'effet règle : la couche d'effet sélectionnée en dernier, sinon la première couche d'effet.
 * @param {import('../scene-doc.js').SceneDoc} scene
 * @param {string[]} selection
 * @returns {import('../scene-doc.js').Layer | null}
 */
export function targetLayer(scene, selection) {
  const effects = scene.layers.filter((layer) => !isIdentityKind(layer.kind));
  const selected = [...selection].reverse().map((id) => effects.find((layer) => layer.id === id)).find((layer) => layer !== undefined);
  return selected ?? effects[0] ?? null;
}

/**
 * @param {{
 *   layer: HTMLElement,
 *   effectSelect: HTMLSelectElement,
 *   fields: HTMLElement,
 *   presetName: HTMLInputElement,
 *   presetTags: HTMLInputElement,
 *   presetSave: HTMLButtonElement,
 *   runtimeStatus: HTMLElement,
 *   effectTarget?: HTMLElement,
 *   onDraftChange?: (isDraft: boolean) => void,
 *   onEdited?: () => void,
 *   onAudioStateChange?: (state: *) => void,
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
  const doc = createStudioDocument({ scene: sceneFromCurrent({ component: null, options: {}, showBranding: false }) });
  const { editor } = doc;
  let measuredFps = null;
  let fpsFrames = 0;
  let fpsSince = now();
  let frameId = 0;

  /** Vrai pendant qu'on charge une scène (preset, antenne, abandon) : ce n'est pas un réglage de l'utilisateur. */
  let loading = false;
  /** Vrai juste après l'ouverture d'un preset : le prochain rendu joue sa transition d'arrivée. */
  let arrivalPending = false;
  /** Vrai pendant qu'un champ du formulaire écrit dans l'éditeur : il garde le focus, on ne le redessine pas. */
  let fieldEdit = false;
  /** @type {import('../scene-doc.js').SceneDoc | null} */
  let renderedScene = null;
  /** @type {string | null} */
  let renderedSolo = null;
  /** Vrai pendant la comparaison : l'aperçu montre l'antenne, le brouillon reste intact derrière. */
  let comparing = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let testTimer = null;
  let renderedFieldsKey = '';

  function createOption(label, value) {
    const option = documentRef.createElement('option');
    option.textContent = label;
    option.value = value;
    return option;
  }

  /** @type {{ render: (transition: *) => void } | null} */
  let transitionControls = null;
  /** @type {{ renderShowOnPreset: (visible: boolean) => void } | null} */
  let brandingControls = null;

  const fieldRenderer = createBackgroundFieldRenderer({
    container: input.fields,
    documentRef,
    onChange(key, value) {
      const target = targetLayer(editor.state().scene, editor.state().selection);
      if (target === null) return;
      fieldEdit = true;
      try {
        editor.setOptions(target.id, { [key]: value }, { coalesceKey: `option:${target.id}:${key}` });
      } finally {
        fieldEdit = false;
      }
    },
  });

  /** Reflète l'état du document dans l'aperçu et dans les panneaux. */
  function reflect() {
    const state = doc.state();
    const { scene } = state;
    input.presetSave.textContent = state.activePresetId === null ? 'Créer' : 'Mettre à jour';
    if (comparing && !state.isDraft) setCompare(false);
    const solo = editor.state().solo;
    const displayed = comparing ? state.onAir : scene;
    if (displayed !== renderedScene || solo !== renderedSolo) {
      const playArrival = arrivalPending && !comparing;
      arrivalPending = false;
      const shown = viewScene(displayed, comparing ? null : solo);
      // Une arrivée (preset essayé, antenne reçue) joue sa transition, ou le fondu par défaut ; un simple réglage
      // s'applique sans animation.
      mount.apply(playArrival ? { ...shown, transition: normalizeTransition(shown.transition) } : withoutTransition(shown));
      renderedScene = displayed;
      renderedSolo = solo;
    }
    const target = targetLayer(scene, editor.state().selection);
    input.effectSelect.value = target?.kind ?? NONE_VALUE;
    if (input.effectTarget !== undefined) {
      input.effectTarget.textContent = target === null ? 'Aucune couche d’effet : choisissez un effet ci-dessous ou ajoutez une couche.' : `Couche réglée : ${target.name ?? backgroundEffectLabel(target.kind)}`;
    }
    const fieldsKey = `${target?.id ?? ''}|${target?.kind ?? ''}`;
    if (!fieldEdit || fieldsKey !== renderedFieldsKey) {
      fieldRenderer.render(target?.kind ?? null, target?.options ?? {});
      renderedFieldsKey = fieldsKey;
    }
    transitionControls?.render(normalizeTransition(scene.transition));
    brandingControls?.renderShowOnPreset(scene.layers.some((layer) => layer.kind === 'branding'));
    input.onDraftChange?.(state.isDraft);
  }

  /** @type {import('../scene-doc.js').SceneDoc | null} */
  let lastScene = null;
  doc.subscribe((state) => {
    reflect();
    // Seul un changement de la scène est un réglage : sélectionner une couche ou la mettre en solo n'en est pas un.
    const changed = state.scene !== lastScene;
    lastScene = state.scene;
    if (changed && !loading) input.onEdited?.();
  });

  /** @param {boolean} on */
  function setCompare(on) {
    comparing = on && doc.state().isDraft;
    input.layer.parentElement?.classList.toggle('is-comparing', comparing);
    reflect();
  }

  /**
   * Rejoue la transition d'arrivée de la scène brouillon dans l'aperçu : on part de l'antenne (ou d'un écran vide s'il n'y a
   * pas de brouillon), puis la scène arrive avec sa transition. L'antenne n'est pas touchée.
   */
  function testArrival() {
    if (comparing) setCompare(false);
    const state = doc.state();
    const transition = normalizeTransition(state.scene.transition);
    const base = state.isDraft ? withoutTransition(viewScene(state.onAir, null)) : sceneFromCurrent({ component: null, options: {}, showBranding: false });
    if (testTimer !== null) windowRef.clearTimeout(testTimer);
    mount.apply(base);
    renderedScene = null;
    testTimer = windowRef.setTimeout(() => {
      testTimer = null;
      const latest = doc.state().scene;
      mount.apply({ ...viewScene(latest, editor.state().solo), transition });
      renderedScene = latest;
    }, 200);
  }

  /** @param {import('../scene-doc.js').SceneDoc} scene */
  function withoutTransition(scene) {
    if (scene.transition === undefined) return scene;
    const { transition: _transition, ...rest } = scene;
    return rest;
  }

  /**
   * Ouvre une scène dans l'aperçu.
   * @param {import('../scene-doc.js').SceneDoc} scene
   * @param {string | null} [presetId]
   * @param {boolean} [asDraft] Vrai pour un preset essayé : l'aperçu change, l'antenne attend « Publier ».
   */
  function apply(scene, presetId = null, asDraft = false) {
    loading = true;
    arrivalPending = true;
    try {
      doc.open(scene, presetId, asDraft);
    } finally {
      loading = false;
      arrivalPending = false;
    }
    input.presetTags.value = Array.isArray(scene.tags) ? scene.tags.join(', ') : '';
    return doc.state();
  }

  input.effectSelect.appendChild(createOption('(aucun)', NONE_VALUE));
  for (const name of BACKGROUND_COMPONENT_NAMES) {
    input.effectSelect.appendChild(createOption(backgroundEffectLabel(name), name));
  }
  input.effectSelect.onchange = () => {
    const kind = input.effectSelect.value === NONE_VALUE ? null : input.effectSelect.value;
    const target = targetLayer(editor.state().scene, editor.state().selection);
    if (kind === null) {
      if (target !== null) editor.removeLayers([target.id]);
    } else if (target === null) {
      editor.addLayer({ kind, options: defaultBackgroundOptions(kind) });
    } else {
      editor.setLayerKind(target.id, kind, defaultBackgroundOptions(kind));
    }
    reflect();
  };

  /**
   * Publie l'aperçu à l'URL OBS. Une arrivée de preset part avec sa `transition` : sans ça, l'URL OBS ne recevrait jamais
   * l'animation (docs/specs/background-preset-transitions.md).
   */
  async function persistNow() {
    const published = doc.publishable();
    try {
      await input.client.publishScene(published);
      doc.markPublished(published);
      input.report.ok();
      return true;
    } catch (error) {
      input.report.error(`state : ${error.message}`);
      return false;
    }
  }

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
    /** Le document du Studio : scène brouillon, antenne, preset ouvert. */
    document: doc,
    /** Le modèle d'édition de la scène brouillon. */
    editor,
    /** Branche la case « Afficher sur ce preset » : elle ajoute ou retire la couche de branding. */
    attachBrandingControls(controls) {
      brandingControls = controls;
      controls.renderShowOnPreset(doc.state().scene.layers.some((layer) => layer.kind === 'branding'));
    },
    /** Branche la section « Arrivée de ce preset » sur la transition de la scène. */
    attachTransitionControls(controls) {
      transitionControls = controls;
      controls.render(normalizeTransition(doc.state().scene.transition));
    },
    /** @param {Record<string, unknown>} patch */
    changeTransition(patch) {
      const transition = normalizeTransition({ ...normalizeTransition(doc.state().scene.transition), ...patch });
      editor.setSceneProps({ transition }, { coalesceKey: 'transition' });
      return { transition };
    },
    /**
     * La présence du branding appartient à la scène : sa couche s'ajoute ou se retire du brouillon, et part à la
     * publication sans attendre un enregistrement de preset.
     * @param {boolean} visible
     */
    changeShowBranding(visible) {
      const present = doc.state().scene.layers.find((layer) => layer.kind === 'branding');
      if (visible && present === undefined) editor.addLayer({ kind: 'branding' });
      else if (!visible && present !== undefined) editor.removeLayers([present.id]);
      return doc.state();
    },
    setCompare,
    isComparing: () => comparing,
    testArrival,
    /** Message de l'antenne (canal `state`) : il n'écrase jamais un brouillon. @param {unknown} message */
    receive(message) {
      loading = true;
      arrivalPending = true;
      try {
        doc.receive(liveSceneOf(/** @type {*} */ (message)));
      } finally {
        loading = false;
        arrivalPending = false;
      }
    },
    react: reactions.handle,
    audioState: () => audio.getState(),
    /** L'état du document : `scene`, `onAir`, `activePresetId`, `isDraft`, `hasArrival`. */
    snapshot: () => doc.state(),
    /** @param {string | null} presetId */
    setActivePresetId(presetId) {
      doc.setActivePresetId(presetId);
      input.presetSave.textContent = presetId === null ? 'Créer' : 'Mettre à jour';
      return doc.state();
    },
    setPalette: fieldRenderer.setPalette,
    /** Envoie l'aperçu à l'URL OBS. */
    publish: persistNow,
    persistNow,
    /** Remplace le brouillon par ce qui est en antenne. */
    discard() {
      loading = true;
      try {
        doc.discard();
      } finally {
        loading = false;
      }
    },
    isDraft: () => doc.state().isDraft,
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
