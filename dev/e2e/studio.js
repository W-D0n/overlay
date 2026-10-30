// @ts-check
/**
 * dev/e2e/studio.js — Outils communs aux suites du Studio : ouvrir la page, lire ses panneaux, viser une ligne.
 */

/**
 * Ouvre le Studio sur des serveurs d'essai, avec l'antenne dans l'état voulu.
 * @param {{ page: *, stack: * }} context
 * @param {Record<string, unknown>} [onAir] état plat de départ
 */
export async function openStudio({ page, stack }, onAir = { component: 'dotgrid', options: {} }) {
  await stack.api('/state', { current: onAir });
  await page.goto(`http://localhost:${stack.staticPort}/dev/studio.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.waitFor("document.querySelectorAll('#layers-list .layer-row').length > 0", 10_000);
  await page.sleep(400);
}

/** @param {number} index rang d'affichage (0 = tout en haut) @returns {string} */
export const layerRow = (index) => `#layers-list .layer-row:nth-child(${index + 1})`;

/** @param {*} page */
export function layerRows(page) {
  return page.evaluate(`[...document.querySelectorAll('#layers-list .layer-row')].map((r) => ({
    id: r.dataset.id, title: r.querySelector('.layer-title').textContent, sub: r.querySelector('.layer-sub').textContent,
    selected: r.classList.contains('is-selected'), hidden: r.classList.contains('is-hidden'), locked: r.classList.contains('is-locked'),
    dimmed: r.classList.contains('is-dimmed'),
    thumb: r.querySelector('.preset-thumb')?.dataset.state ?? (r.querySelector('.layer-thumb-identity') ? 'identity' : 'none'),
  }))`);
}

/** @param {*} page @returns {Promise<string>} les titres du haut vers le bas, séparés par des virgules */
export async function layerTitles(page) {
  return (await layerRows(page)).map((/** @type {{ title: string }} */ row) => row.title).join();
}

/** Les éléments d'état du panneau et de la barre de publication. @param {*} page */
export function panelState(page) {
  return page.evaluate(`({
    gauge: document.getElementById('layers-gauge').textContent,
    level: document.getElementById('layers-gauge').dataset.level,
    undoDisabled: document.getElementById('layers-undo').disabled,
    redoDisabled: document.getElementById('layers-redo').disabled,
    undoTitle: document.getElementById('layers-undo').title,
    addDisabled: document.getElementById('layers-add').disabled,
    bar: document.getElementById('publish-bar').dataset.state,
    target: document.getElementById('effect-target').textContent,
    effect: document.getElementById('effect-select').value,
    save: document.getElementById('preset-save').textContent,
    branding: document.getElementById('branding-show-on-preset')?.checked,
    canvases: [...document.getElementById('bg-layer').querySelectorAll('canvas')].filter((c) => c.getBoundingClientRect().width > 0).length,
  })`);
}

/**
 * Le sélecteur du bouton « charger » du preset de ce nom dans la liste « Mes presets ».
 * @param {*} page
 * @param {string} name
 * @returns {Promise<string>}
 */
export async function presetLoad(page, name) {
  const index = await page.evaluate(`[...document.querySelectorAll('#preset-list .preset-row')].findIndex((row) => row.querySelector('.preset-load').textContent.startsWith(${JSON.stringify(name)}))`);
  if (index < 0) throw new Error(`preset introuvable dans la liste : ${name}`);
  return `#preset-list .preset-row:nth-child(${index + 1}) .preset-load`;
}

/** Ajoute un effet par la galerie. @param {*} page @param {string} kind */
export async function addLayer(page, kind) {
  await page.click('#layers-add');
  await page.click(`#gallery-grid [data-kind="${kind}"]`);
  await page.sleep(250);
}

/** @param {string} kind @param {Record<string, unknown>} [over] */
export const layerOf = (kind, over = {}) => ({ id: kind, kind, visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: {}, ...over });
