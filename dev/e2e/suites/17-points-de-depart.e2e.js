// @ts-check
/**
 * Les points de départ à plusieurs couches : on les essaie (la pile apparaît telle quelle, sans toucher l'antenne), puis « + » les
 * range dans « Mes scènes » où ils s'ouvrent avec toutes leurs couches.
 */
import { layerRows, openStudio } from '../studio.js';

export const name = 'points de départ';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  const starters = () => page.evaluate("[...document.querySelectorAll('#builtin-list .preset-row-builtin')].map((r) => r.querySelector('.preset-title').textContent)");

  const list = await starters();
  check('les points de départ à plusieurs couches sont proposés avec les autres', ['Nuit calme', 'Code de nuit', 'Bulles et ondes'].every((n) => list.includes(n)) && list.includes('Respiration'));

  // Essayer : la pile de deux effets apparaît, l'antenne ne bouge pas.
  const onAirBefore = JSON.stringify((await stack.api('/state')).scene);
  await page.evaluate("[...document.querySelectorAll('#builtin-list .preset-row-builtin')].find((r) => r.querySelector('.preset-title').textContent === 'Nuit calme').querySelector('.preset-try').click()");
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-row .layer-title')].some((t) => /Stars/i.test(t.textContent)) && [...document.querySelectorAll('#layers-list .layer-row .layer-title')].some((t) => /Water|Ripple/i.test(t.textContent))", 8000);
  const rows = (await layerRows(page)).filter((r) => r.id !== 'branding');
  check('essayer montre les deux couches de la scène', rows.length === 2);
  check('l’antenne n’a pas bougé : c’est un essai', JSON.stringify((await stack.api('/state')).scene) === onAirBefore);

  // « + » : la scène rejoint Mes scènes, entière.
  await page.evaluate("[...document.querySelectorAll('#builtin-list .preset-row-builtin')].find((r) => r.querySelector('.preset-title').textContent === 'Nuit calme').querySelector('.preset-add').click()");
  const saved = await page.waitFor("[...document.querySelectorAll('#preset-list .preset-load')].some((b) => b.textContent.includes('Nuit calme — perso'))", 8000);
  check('« + » range la scène dans « Mes scènes »', saved);
  const onServer = (await stack.api('/state')).scenes.find((/** @type {*} */ s) => s.name === 'Nuit calme — perso');
  check('le serveur la détient avec ses deux couches, placement et opacité compris', onServer?.layers.length === 2 && onServer.layers[1].placement.y === 0.5 && onServer.layers[1].opacity === 0.55);

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
