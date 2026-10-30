// @ts-check
/**
 * dev/layers-panel-view.js — Ce que le panneau de couches affiche, calculé d'une scène : logique pure, sans DOM.
 *
 * Le panneau liste les couches du dessus vers le dessous (comme dans un éditeur graphique), les couches d'identité
 * (branding) toujours en tête puisque le moteur les montre au-dessus des effets.
 *
 * @typedef {import('../scene-doc.js').SceneDoc} SceneDoc
 * @typedef {import('../scene-doc.js').Layer} Layer
 * @typedef {{
 *   id: string,
 *   title: string,
 *   subtitle: string,
 *   kind: string,
 *   kindLabel: string,
 *   identity: boolean,
 *   visible: boolean,
 *   locked: boolean,
 *   opacityPercent: number,
 *   selected: boolean,
 *   solo: boolean,
 *   dimmed: boolean,
 * }} LayerRow
 */
import { MAX_LAYERS } from '../scene-doc.js';
import { isIdentityKind } from '../layer-kinds.js';

/** À partir de combien de couches la jauge prévient : chaque couche d'effet pleine toile est un canvas de plus à dessiner. */
export const LOAD_WARNING_LAYERS = 6;

/**
 * Les lignes du panneau, du dessus vers le dessous. `dimmed` : la couche est masquée par le solo d'une autre couche.
 * @param {SceneDoc} scene
 * @param {{ selection: readonly string[], solo: string | null, labelOf: (kind: string) => string }} context
 * @returns {LayerRow[]}
 */
export function layerRows(scene, { selection, solo, labelOf }) {
  const rows = scene.layers.map((layer) => ({
    id: layer.id,
    title: layer.name ?? labelOf(layer.kind),
    // Le type n'est rappelé que si le nom l'a remplacé ; l'opacité, que si elle n'est pas pleine : pas de répétition.
    subtitle: [layer.name === undefined ? null : labelOf(layer.kind), layer.opacity < 1 ? `${Math.round(layer.opacity * 100)} %` : null].filter((part) => part !== null).join(' · '),
    kind: layer.kind,
    kindLabel: labelOf(layer.kind),
    identity: isIdentityKind(layer.kind),
    visible: layer.visible,
    locked: layer.locked === true,
    opacityPercent: Math.round(layer.opacity * 100),
    selected: selection.includes(layer.id),
    solo: solo === layer.id,
    dimmed: solo !== null && solo !== layer.id,
  }));
  return rows.reverse();
}

/**
 * La jauge de charge : nombre de couches, borne, et un niveau (`ok`, `warn` dès 6, `full` à la borne).
 * @param {SceneDoc} scene
 * @returns {{ count: number, max: number, level: 'ok' | 'warn' | 'full', label: string, hint: string }}
 */
export function loadGauge(scene) {
  const count = scene.layers.length;
  const level = count >= MAX_LAYERS ? 'full' : count >= LOAD_WARNING_LAYERS ? 'warn' : 'ok';
  return {
    count,
    max: MAX_LAYERS,
    level,
    label: `${count} / ${MAX_LAYERS}`,
    hint: level === 'full'
      ? 'Limite atteinte : supprimez ou fusionnez une couche pour en ajouter une.'
      : level === 'warn'
        ? 'Chaque effet pleine toile est un canvas de plus à dessiner dans OBS : gardez la charge sous contrôle.'
        : 'Chaque effet pleine toile est un canvas de plus à dessiner dans OBS.',
  };
}

/**
 * Où déposer des couches glissées : sur le bord haut ou bas d'une ligne. Rend la position `to` attendue par
 * `moveLayers` — ou `null` quand le dépôt n'a pas de sens (sur une des couches déplacées, ou entre familles : un effet
 * ne se range pas parmi les couches d'identité).
 * @param {SceneDoc} scene
 * @param {readonly string[]} movingIds couches glissées
 * @param {string} overId la ligne survolée
 * @param {'top' | 'bottom'} edge bord de cette ligne, tel qu'affiché (la liste va du dessus vers le dessous)
 * @returns {{ to: number } | null}
 */
export function dropPosition(scene, movingIds, overId, edge) {
  const first = scene.layers.find((layer) => movingIds.includes(layer.id));
  if (first === undefined || movingIds.includes(overId)) return null;
  const identity = isIdentityKind(first.kind);
  const family = scene.layers.filter((layer) => isIdentityKind(layer.kind) === identity);
  if (movingIds.some((id) => !family.some((layer) => layer.id === id))) return null;
  const staying = family.filter((layer) => !movingIds.includes(layer.id));
  const anchor = staying.findIndex((layer) => layer.id === overId);
  if (anchor < 0) return null;
  // Affichée du dessus vers le dessous : le bord haut d'une ligne est juste au-dessus d'elle dans la pile.
  return { to: edge === 'top' ? anchor + 1 : anchor };
}
