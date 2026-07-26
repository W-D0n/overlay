// @ts-check
import { BACKGROUND_FIELD_SCHEMAS } from './component-field-schemas.js';
import { DEFAULT_TRANSITION, normalizeTransition } from '../background-transition.js';

/** @param {string} component */
export function defaultBackgroundOptions(component) {
  const options = {};
  for (const field of BACKGROUND_FIELD_SCHEMAS[component]) options[field.key] = field.default;
  return options;
}

export function createBackgroundPreviewSession() {
  let current = { component: null, options: {} };
  let activePresetId = null;
  /** Transition du preset en cours d'édition — enregistrée avec lui, jamais avec un réglage. */
  let transition = { ...DEFAULT_TRANSITION };
  /**
   * Vrai uniquement juste après une arrivée de preset. C'est ce drapeau qui décide si l'état
   * diffusé porte une `transition` : présent = anime, absent = simple réglage
   * (docs/specs/background-preset-transitions.md).
   */
  let arriving = false;
  /** Visibilité du branding pour le preset en cours — voyage toujours avec l'état diffusé. */
  let showBranding = true;

  function snapshot() {
    return {
      current: {
        component: current.component,
        options: { ...current.options },
        showBranding,
        ...(arriving ? { transition: { ...transition } } : {}),
      },
      activePresetId,
      transition: { ...transition },
      showBranding,
    };
  }

  return {
    snapshot,
    /**
     * @param {{ component: string | null, options: Record<string, unknown> }} next
     * @param {string | null} [presetId]
     */
    apply(next, presetId = null) {
      current = { component: next.component, options: { ...next.options } };
      activePresetId = presetId;
      transition = normalizeTransition(next.transition);
      showBranding = next.showBranding !== false;
      arriving = true;
      const state = snapshot();
      // L'arrivée n'a lieu qu'une fois : les réglages qui suivent ne doivent pas ré-animer.
      arriving = false;
      return state;
    },
    /** @param {string | null} component */
    selectEffect(component) {
      current = {
        component,
        options: component === null ? {} : defaultBackgroundOptions(component),
      };
      activePresetId = null;
      return snapshot();
    },
    /**
     * Modifie la transition du preset en cours d'édition. Ne déclenche aucune animation : elle
     * ne s'applique qu'à la prochaine arrivée de ce preset.
     * @param {Partial<import('../background-transition.js').BackgroundTransition>} patch
     */
    changeTransition(patch) {
      transition = normalizeTransition({ ...transition, ...patch });
      return snapshot();
    },
    /** @param {string} key @param {unknown} value */
    changeOption(key, value) {
      current = { ...current, options: { ...current.options, [key]: value } };
      return snapshot();
    },
    /** @param {boolean} visible */
    setShowBranding(visible) {
      showBranding = visible;
      return snapshot();
    },
    /** @param {string | null} presetId */
    setActivePresetId(presetId) {
      activePresetId = presetId;
      return snapshot();
    },
  };
}
