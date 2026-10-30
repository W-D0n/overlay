// @ts-check
/**
 * dev/announcer.js — Annonces pour les lecteurs d'écran : ce qui change dans l'éditeur sans que le focus bouge (sélection,
 * annuler / rétablir, retour dans l'historique) est dit dans une zone `aria-live`. Rien de visuel.
 *
 * `announcement` est pur : il compare deux états de l'éditeur et rend la phrase, ou `null` s'il n'y a rien à dire.
 *
 * @typedef {import('./scene-editor.js').EditorState} EditorState
 */

/**
 * @typedef {{ state: EditorState, history: ReturnType<import('./scene-editor.js').SceneEditor['history']> }} Snapshot
 */

/**
 * @param {Snapshot | null} before
 * @param {Snapshot} after
 * @param {(kind: string) => string} labelOf
 * @returns {string | null}
 */
export function announcement(before, after, labelOf) {
  if (before === null) return null;
  // Un déplacement dans l'historique restitue une scène déjà détenue ; une modification en crée une neuve (et se tait : c'est
  // le geste de l'utilisateur, il le sait).
  if (after.state.scene !== before.state.scene) {
    const held = new Set(before.history.entries.flatMap((entry) => [entry.before, entry.after]));
    if (held.has(after.state.scene)) {
      const delta = after.history.position - before.history.position;
      if (delta < 0) return delta === -1 ? `Annulé : ${before.history.entries[before.history.position - 1].label}` : `Retour de ${-delta} étapes`;
      if (delta > 0) return delta === 1 ? `Rétabli : ${after.history.entries[after.history.position - 1].label}` : `Avance de ${delta} étapes`;
    }
  }
  const titleOf = (/** @type {string} */ id) => {
    const layer = after.state.scene.layers.find((candidate) => candidate.id === id);
    return layer === undefined ? id : layer.name ?? labelOf(layer.kind);
  };
  const same = before.state.selection.length === after.state.selection.length && before.state.selection.every((id, index) => id === after.state.selection[index]);
  if (same) return null;
  if (after.state.selection.length === 0) return 'Aucune couche sélectionnée';
  if (after.state.selection.length === 1) return `Couche sélectionnée : ${titleOf(after.state.selection[0])}`;
  return `${after.state.selection.length} couches sélectionnées`;
}

/**
 * @param {{
 *   element: HTMLElement,
 *   editor: import('./scene-editor.js').SceneEditor,
 *   labelOf: (kind: string) => string,
 * }} input
 */
export function createAnnouncer({ element, editor, labelOf }) {
  /** @type {Snapshot | null} */
  let previous = { state: editor.state(), history: editor.history() };
  const stop = editor.subscribe((state) => {
    const current = { state, history: editor.history() };
    const message = announcement(previous, current, labelOf);
    previous = current;
    if (message === null) return;
    // Une phrase identique à la précédente doit être relue quand même : un espace insécable final change le texte sans changer le sens.
    const repeated = element.textContent === message;
    element.textContent = repeated ? `${message} ` : message;
  });
  return { destroy: stop };
}
