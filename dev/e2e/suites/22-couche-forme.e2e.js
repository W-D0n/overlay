// @ts-check
/**
 * La couche de contenu « forme » : ajout par la galerie, forme et remplissage réglés dans le formulaire, couleurs lues dans les
 * pixels de l'aperçu, placement, publication et rechargement.
 */
import { openStudio } from '../studio.js';

export const name = 'couche forme';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });

  /** Les pixels (r, g, b, a) de points du dernier canvas de couche de l'aperçu, en fractions de sa taille. */
  const pixels = (/** @type {[number, number][]} */ points) => page.evaluate(`(() => {
    const canvas = [...document.getElementById('bg-layer').querySelectorAll('canvas')].filter((c) => c.parentElement.id !== 'bg-layer').at(-1);
    const context = canvas.getContext('2d');
    return ${JSON.stringify(points)}.map(([fx, fy]) => [...context.getImageData(Math.round((canvas.width - 1) * fx), Math.round((canvas.height - 1) * fy), 1, 1).data]);
  })()`);
  await page.click('#layers-add');
  await page.click('#gallery-grid [data-kind="shape"]');
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Forme')", 8000);
  await page.sleep(600);

  let [corner, center] = await pixels([[0.02, 0.02], [0.5, 0.5]]);
  check('un rectangle plein remplit la zone, coins compris, de la couleur réglée (or)', corner[3] > 200 && center[3] > 200 && Math.abs(center[0] - 200) < 6 && Math.abs(center[1] - 185) < 6 && Math.abs(center[2] - 122) < 6);
  check('le sélecteur de type d’une forme ne propose que des contenus', (await page.evaluate("[...document.querySelectorAll('#effect-select option')].map((o) => o.value).join()")) === '__none__,text,shape');

  const selects = await page.evaluate("[...document.querySelectorAll('#fields select')].map((s) => [...s.options].map((o) => o.value).join('|'))");
  check('le formulaire propose les formes et les remplissages', selects.some((/** @type {string} */ s) => s === 'rectangle|ellipse|triangle|diamond|line') && selects.some((/** @type {string} */ s) => s === 'solid|gradient|none'));

  const shapeIndex = selects.findIndex((/** @type {string} */ s) => s.startsWith('rectangle|'));
  const fillIndex = selects.findIndex((/** @type {string} */ s) => s.startsWith('solid|'));
  const choose = async (/** @type {number} */ index, /** @type {string} */ value) => {
    await page.evaluate(`(() => { const select = document.querySelectorAll('#fields select')[${index}]; select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await page.sleep(600);
  };

  await choose(shapeIndex, 'ellipse');
  [corner, center] = await pixels([[0.02, 0.02], [0.5, 0.5]]);
  check('une ellipse laisse les coins transparents et remplit le centre', corner[3] === 0 && center[3] > 200);

  await choose(shapeIndex, 'diamond');
  [corner, center] = await pixels([[0.02, 0.02], [0.5, 0.5]]);
  check('un losange laisse les coins transparents', corner[3] === 0 && center[3] > 200);

  await choose(shapeIndex, 'rectangle');
  await choose(fillIndex, 'gradient');
  const [top, bottom] = await pixels([[0.5, 0.05], [0.5, 0.95]]);
  check('un dégradé change de couleur de haut en bas (or vers gris sombre)', top[0] > bottom[0] + 60 && top[3] > 200 && bottom[3] > 200);

  await choose(fillIndex, 'none');
  [corner, center] = await pixels([[0.02, 0.02], [0.5, 0.5]]);
  check('sans remplissage ni contour, rien n’est peint', corner[3] === 0 && center[3] === 0);

  await choose(fillIndex, 'solid');
  await page.fill('#inspector-width', 30);
  await page.fill('#inspector-height', 10);
  await page.sleep(600);
  const box = await page.evaluate(`(() => {
    const canvas = [...document.getElementById('bg-layer').querySelectorAll('canvas')].filter((c) => c.parentElement.id !== 'bg-layer').at(-1);
    const stage = document.getElementById('bg-layer').getBoundingClientRect();
    const rect = canvas.parentElement.getBoundingClientRect();
    return { w: rect.width / stage.width, h: rect.height / stage.height };
  })()`);
  check('la forme suit la zone de sa couche : 30 % × 10 % de la toile', Math.abs(box.w - 0.3) < 0.01 && Math.abs(box.h - 0.1) < 0.01);
  [corner, center] = await pixels([[0.02, 0.05], [0.5, 0.5]]);
  check('redimensionnée, la forme remplit toujours toute sa zone', corner[3] > 200 && center[3] > 200);

  await page.click('#publish-send');
  await page.waitFor("document.getElementById('publish-bar').dataset.state === 'live'", 8000);
  const aired = (await stack.api('/state')).scene.layers.find((/** @type {*} */ layer) => layer.kind === 'shape');
  check('publié : la forme est à l’antenne avec ses options et son placement', aired !== undefined && aired.options.shape === 'rectangle' && aired.options.fill === 'solid' && Math.abs(aired.placement.width - 0.3) < 0.001 && Math.abs(aired.placement.height - 0.1) < 0.001);

  await page.goto(`http://localhost:${stack.staticPort}/dev/studio.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Forme')", 10_000);
  await page.sleep(600);
  [center] = await pixels([[0.5, 0.5]]);
  check('après rechargement, la forme publiée est de retour et peinte', center !== undefined && center[3] > 200);

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
