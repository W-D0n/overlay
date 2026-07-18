// @ts-check

/**
 * @typedef {object} BackgroundPresetImportPending
 * @property {string} content
 * @property {{presets:{id:string}[]}} parsed
 * @property {string} revision
 * @property {import('./background-preset-library.js').BackgroundPresetImportPreview} plan
 */

/** @returns {{pending:BackgroundPresetImportPending|null,importing:boolean}} */
export function createBackgroundPresetImportReview() {
  return { pending: null, importing: false };
}

/**
 * Workflow pur de confirmation. Une sélection ou une annulation ne produit jamais de commande
 * réseau ; seule une confirmation d'un plan présent émet `import`.
 * @param {{pending:BackgroundPresetImportPending|null,importing:boolean}} state
 * @param {{type:'selected',pending:BackgroundPresetImportPending}|{type:'cancelled'|'confirmed'|'completed'|'failed'}} event
 */
export function reduceBackgroundPresetImportReview(state, event) {
  if (event.type === 'selected') {
    if (state.importing) return { state, command: null };
    return { state: { pending: event.pending, importing: false }, command: null };
  }
  if (event.type === 'cancelled') {
    if (state.importing) return { state, command: null };
    return { state: createBackgroundPresetImportReview(), command: null };
  }
  if (event.type === 'confirmed') {
    if (state.pending === null || state.importing) return { state, command: null };
    return {
      state: { pending: state.pending, importing: true },
      command: { type: 'import', pending: state.pending },
    };
  }
  if (event.type === 'failed') {
    return { state: { pending: state.pending, importing: false }, command: null };
  }
  return { state: createBackgroundPresetImportReview(), command: null };
}
