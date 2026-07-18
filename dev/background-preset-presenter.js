// @ts-check
import {
  BACKGROUND_FIELD_SCHEMAS,
  backgroundEffectLabel,
} from './component-field-schemas.js';

/** @typedef {import('./background-preset-library.js').BackgroundPresetImportChange} BackgroundPresetImportChange */
/** @typedef {import('./background-preset-library.js').BackgroundPresetImportDifference} BackgroundPresetImportDifference */
/** @typedef {import('./background-preset-library.js').BackgroundPresetImportOperation} BackgroundPresetImportOperation */

/** @type {Record<BackgroundPresetImportOperation,string>} */
const IMPORT_OPERATION_LABELS = {
  created: 'Création',
  updated: 'Mise à jour',
  unchanged: 'Ignoré',
};

/** @param {unknown} value @param {string} field */
function formatImportValue(value, field) {
  if (field === 'component' && typeof value === 'string') return backgroundEffectLabel(value);
  if (Array.isArray(value)) return value.length === 0 ? 'aucun' : value.map(String).join(', ');
  if (value === null) return 'aucun';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** @param {string} component @param {string} key */
function importOptionLabel(component, key) {
  return BACKGROUND_FIELD_SCHEMAS[component]?.find((field) => field.key === key)?.label
    ?? `Option ${key}`;
}

/**
 * @param {BackgroundPresetImportChange} change
 * @param {BackgroundPresetImportDifference} difference
 */
function formatImportDifference(change, difference) {
  const componentDifference = change.differences.find(({ field }) => field === 'component');
  const beforeComponent = componentDifference?.before ?? change.component;
  const afterComponent = componentDifference?.after ?? change.component;
  const hasBefore = Object.hasOwn(difference, 'before');
  const hasAfter = Object.hasOwn(difference, 'after');
  const label = difference.field === 'name'
    ? 'Nom'
    : difference.field === 'component'
      ? 'Effet'
      : difference.field === 'tags'
        ? 'Tags'
        : importOptionLabel(hasAfter ? afterComponent : beforeComponent, difference.key);
  const before = hasBefore ? formatImportValue(difference.before, difference.field) : null;
  const after = hasAfter ? formatImportValue(difference.after, difference.field) : null;
  if (!hasBefore) return `${label} : ${after}`;
  if (!hasAfter) return `${label} : retiré (avant : ${before})`;
  return `${label} : ${before} → ${after}`;
}

/**
 * Formate le plan métier pour l'étape de confirmation du tuner.
 * @param {{created:number,updated:number,renamed:number,unchanged:number}} plan
 */
export function formatBackgroundPresetImportSummary(plan) {
  const createdLabel = plan.created > 1 ? 'nouveaux' : 'nouveau';
  const updatedLabel = plan.updated > 1 ? 'mises à jour' : 'mise à jour';
  const renamedLabel = plan.renamed > 1 ? 'noms ajustés' : 'nom ajusté';
  const unchangedLabel = plan.unchanged > 1 ? 'ignorés' : 'ignoré';
  return `${plan.created} ${createdLabel} · ${plan.updated} ${updatedLabel} · ${plan.renamed} ${renamedLabel} · ${plan.unchanged} ${unchangedLabel}`;
}

/**
 * Transforme une entrée du plan métier en textes directement lisibles dans le panneau.
 * @param {BackgroundPresetImportChange} change
 */
export function formatBackgroundPresetImportChange(change) {
  const note = change.conflict === null
    ? (change.operation === 'unchanged' ? 'Aucun changement : ce preset sera ignoré.' : '')
    : `Le nom « ${change.requestedName} » est déjà utilisé par « ${change.conflict.name} » ; le preset sera importé sous « ${change.name} ».`;
  return {
    operationLabel: IMPORT_OPERATION_LABELS[change.operation],
    title: change.name,
    note,
    details: change.differences.map((difference) => formatImportDifference(change, difference)),
  };
}
