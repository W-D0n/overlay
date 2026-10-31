// @ts-check
import { kindFamily } from '../layer-kinds.js';

/**
 * dev/version-view.js — Comment la fenêtre des versions décrit une version : sa date, ce qu'elle contient, ce qui la distingue de la scène en
 * cours. Pur : testable sans navigateur.
 */

/**
 * « 31/10/2026 14:05 », ou « — » pour une date illisible.
 * @param {string} iso
 * @returns {string}
 */
export function formatVersionDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const two = (/** @type {number} */ value) => String(value).padStart(2, '0');
  return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/**
 * « 3 couches : Pluie, Texte, Identité » (les libellés sont fournis).
 * @param {import('../scene-doc.js').SceneDoc} scene
 * @param {(kind: string) => string} labelOf
 * @returns {string}
 */
export function describeVersion(scene, labelOf) {
  const count = scene.layers.length;
  if (count === 0) return 'aucune couche';
  const names = scene.layers.map((layer) => layer.name ?? labelOf(layer.kind));
  const shown = names.slice(0, 4).join(', ');
  return `${count} couche${count > 1 ? 's' : ''} : ${shown}${names.length > 4 ? '…' : ''}`;
}

/**
 * Ce qui change si on restaure cette version dans la scène en cours : une phrase courte, pour décider avant de cliquer.
 * @param {import('../scene-doc.js').SceneDoc} version
 * @param {import('../scene-doc.js').SceneDoc} current
 * @returns {string}
 */
export function describeRestoration(version, current) {
  const stable = (/** @type {unknown} */ value) => JSON.stringify(value);
  if (stable(version.layers) === stable(current.layers) && stable(version.transition) === stable(current.transition)) return 'identique à la scène en cours';
  const diff = version.layers.length - current.layers.length;
  const contents = (/** @type {import('../scene-doc.js').SceneDoc} */ scene) => scene.layers.filter((layer) => kindFamily(layer.kind) === 'content').length;
  if (diff > 0) return `ajoute ${diff} couche${diff > 1 ? 's' : ''} par rapport à la scène en cours`;
  if (diff < 0) return `retire ${-diff} couche${-diff > 1 ? 's' : ''} par rapport à la scène en cours`;
  const delta = contents(version) - contents(current);
  if (delta !== 0) return `${delta > 0 ? 'ajoute' : 'retire'} ${Math.abs(delta)} contenu${Math.abs(delta) > 1 ? 's' : ''}`;
  return 'même nombre de couches, réglages différents';
}
