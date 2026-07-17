// @ts-check
import { BACKGROUND_FIELD_SCHEMAS } from './component-field-schemas.js';

/** @param {string} component */
export function defaultBackgroundOptions(component) {
  const options = {};
  for (const field of BACKGROUND_FIELD_SCHEMAS[component]) options[field.key] = field.default;
  return options;
}

export function createBackgroundPreviewSession() {
  let current = { component: null, options: {} };
  let activePresetId = null;

  function snapshot() {
    return {
      current: { component: current.component, options: { ...current.options } },
      activePresetId,
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
      return snapshot();
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
    /** @param {string} key @param {unknown} value */
    changeOption(key, value) {
      current = { ...current, options: { ...current.options, [key]: value } };
      return snapshot();
    },
    /** @param {string | null} presetId */
    setActivePresetId(presetId) {
      activePresetId = presetId;
      return snapshot();
    },
  };
}
