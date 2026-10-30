// @ts-check
import { sceneDetails, sceneEffectsLabel } from './scene-labels.js';

/**
 * dev/history-view.js — Présentation de l'historique des publications : de quoi remplir une ligne du panneau.
 * Pur : le libellé d'effet et l'horloge sont fournis.
 *
 * @typedef {{ at: string, scene: import('../scene-doc.js').SceneDoc }} HistoryEntry
 * @typedef {{ at: string, title: string, when: string, detail: string }} HistoryRow
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * « à l'instant », « il y a 12 min », « il y a 3 h », puis la date et l'heure. Un instant dans le futur
 * (horloges décalées) ou illisible s'affiche tel quel plutôt que faux.
 * @param {string} at
 * @param {number} nowMs
 * @param {(date: Date) => string} formatDate
 */
export function relativeTime(at, nowMs, formatDate) {
  const time = Date.parse(at);
  if (Number.isNaN(time)) return at;
  const elapsed = nowMs - time;
  if (elapsed < 0) return formatDate(new Date(time));
  if (elapsed < MINUTE_MS) return 'à l’instant';
  if (elapsed < HOUR_MS) return `il y a ${Math.floor(elapsed / MINUTE_MS)} min`;
  if (elapsed < 24 * HOUR_MS) return `il y a ${Math.floor(elapsed / HOUR_MS)} h`;
  return formatDate(new Date(time));
}

/**
 * @param {readonly HistoryEntry[]} entries le plus récent d'abord
 * @param {{ labelOf: (kind: string) => string, nowMs: number, formatDate: (date: Date) => string }} deps
 * @returns {HistoryRow[]}
 */
export function historyRows(entries, { labelOf, nowMs, formatDate }) {
  return entries.map(({ at, scene }) => ({
    at,
    title: sceneEffectsLabel(scene, labelOf),
    when: `remplacé ${relativeTime(at, nowMs, formatDate)}`,
    detail: sceneDetails(scene).join(' · '),
  }));
}
