// @ts-check
/**
 * dev/edit-history.js — L'historique d'édition mis en forme : une ligne par étape de travail (plus l'état de départ), avec
 * ce qu'elle a changé, depuis quand, et ce qui la sépare de l'état actuel. Logique pure ; l'interface est dans
 * `edit-history-controller.js`.
 *
 * @typedef {ReturnType<import('./scene-editor.js').SceneEditor['history']>} EditorHistory
 * @typedef {{ labelOf?: (kind: string) => string, optionLabel?: (kind: string, key: string) => string }} DiffLabels
 * @typedef {{
 *   position: number, label: string, age: string, summary: string, details: string[],
 *   state: 'start' | 'done' | 'current' | 'undone', distance: number
 * }} HistoryRow
 */
import { diffScenes } from './scene-diff.js';

/**
 * Depuis quand, en mots.
 * @param {number} at
 * @param {number} now
 */
export function formatAge(at, now) {
  if (at <= 0) return '';
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 5) return 'à l’instant';
  if (seconds < 60) return `il y a ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  return `il y a ${Math.round(minutes / 60)} h`;
}

/**
 * Les lignes à montrer, de la plus récente à l'état de départ. La ligne `position` p est l'état *après* p étapes ; la ligne
 * 0 est l'état de départ. `distance` : combien d'étapes séparent cette ligne de l'état actuel.
 * @param {EditorHistory} history
 * @param {number} now
 * @param {DiffLabels} [labels]
 * @returns {HistoryRow[]}
 */
export function describeHistory(history, now, labels = {}) {
  /** @type {HistoryRow[]} */
  const rows = history.entries.map((entry, index) => {
    const position = index + 1;
    const changes = diffScenes(entry.before, entry.after, labels);
    return {
      position,
      label: entry.label,
      age: formatAge(entry.at, now),
      summary: changes.length === 0 ? 'Sélection ou réglage sans effet visible' : changes.map((change) => change.title).join(', '),
      details: changes.flatMap((change) => (change.details.length > 0 ? change.details.map((detail) => `${change.title} — ${detail}`) : [`${change.title} — ${{ added: 'ajoutée', removed: 'retirée', order: 'ordre modifié', changed: 'modifiée' }[change.kind]}`])),
      state: position === history.position ? 'current' : position < history.position ? 'done' : 'undone',
      distance: position - history.position,
    };
  });
  const start = /** @type {HistoryRow} */ ({
    position: 0, label: 'État de départ', age: '', summary: 'La scène telle qu’elle a été ouverte', details: [],
    state: history.position === 0 ? 'current' : 'start', distance: -history.position,
  });
  return [...rows.reverse(), start];
}

/**
 * Ce qui change entre l'état d'une ligne et l'état actuel, ce qu'un retour à cette ligne ferait disparaître ou revenir.
 * @param {EditorHistory} history
 * @param {number} position
 * @param {import('../scene-doc.js').SceneDoc} current
 * @param {DiffLabels} [labels]
 */
export function compareWithCurrent(history, position, current, labels = {}) {
  const target = position === 0 ? history.entries[0]?.before : history.entries[position - 1]?.after;
  return target === undefined ? [] : diffScenes(current, target, labels);
}
