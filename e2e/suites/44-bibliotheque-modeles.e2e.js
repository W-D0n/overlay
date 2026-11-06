// @ts-check
/**
 * The template library in the real Studio: the dialog lists the shipped templates by category, a search narrows them, a template is inserted in one history step
 * (a group template brings its group), and "Copier dans mes modèles" puts a copy among the owner templates, on the server.
 */
import { layerRows, openStudio } from '../studio.js';

export const name = 'bibliothèque de modèles';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  await stack.api('/studio-settings', { templates: [] });
  await page.evaluate('localStorage.clear()');
  await page.goto(`http://localhost:${stack.staticPort}/studio/index.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.waitFor("document.querySelectorAll('#layers-list .layer-row').length > 0", 10_000);
  await page.sleep(400);

  const paletteRun = async (/** @type {string} */ query) => {
    await page.press('Control+k');
    await page.fill('#palette-input', query);
    await page.press('Enter');
    await page.sleep(250);
  };
  const library = () => page.evaluate("[...document.querySelectorAll('#templates-library .tpl-card')].map((c) => c.dataset.id)");
  const categories = () => page.evaluate("[...document.querySelectorAll('#templates-library .tpl-category')].map((c) => c.textContent)");
  const mine = () => page.evaluate("[...document.querySelectorAll('#templates-list .tpl-card')].map((c) => c.querySelector('strong').textContent)");
  const cardButton = (/** @type {string} */ id, /** @type {string} */ action) => `#templates-library .tpl-card[data-id="${id}"] [data-action="${action}"]`;
  const titles = async () => (await layerRows(page)).map((/** @type {*} */ row) => row.title).join('|');

  const before = await titles();
  await paletteRun('modèles de couches');
  const all = await library();
  check('the library lists the eight shipped templates', all.length === 8 ? true : all);
  check('they come under their categories', (await categories()).join() === 'Titres,Bandeaux,Alertes,Écrans d’attente,Habillages' ? true : await categories());

  await page.fill('#templates-search', 'alerte');
  check('a search narrows the library to the two alerts', (await library()).join() === 'lib.alerte-follow,lib.alerte-raid' ? true : await library());
  await page.fill('#templates-search', 'zzzz');
  check('nothing matching says so', (await library()).length === 0 && (await page.evaluate("!document.getElementById('templates-library-empty').hidden")));
  await page.fill('#templates-search', '');
  check('clearing the search brings everything back', (await library()).length === 8);

  // A group template: the group comes with its members, in one step.
  await page.click(cardButton('lib.titre-sous-titre', 'insert'));
  await page.sleep(400);
  const rows = await page.evaluate("[...document.querySelectorAll('#layers-list .layer-row')].map((r) => (r.classList.contains('is-group') ? 'G:' : '') + (r.dataset.depth === '1' ? '>' : '') + r.querySelector('.layer-title').textContent)");
  check('inserting a group template adds its group and its three members', rows.includes('G:Titre et sous-titre') && rows.filter((/** @type {string} */ r) => r.startsWith('>')).length === 3 ? true : rows);
  check('the dialog closes after an insertion', await page.evaluate('!document.getElementById("templates-dialog").open'));
  await page.click('#layers-undo');
  check('undo removes the whole template in one step', (await titles()) === before ? true : await titles());

  // Copy to the owner templates: kept on the server.
  await paletteRun('modèles de couches');
  await page.click(cardButton('lib.titre-neon', 'copy'));
  await page.sleep(500);
  check('copying puts the template among "Mes modèles"', (await mine()).join() === 'Titre néon' ? true : await mine());
  await page.click(cardButton('lib.titre-neon', 'copy'));
  await page.sleep(500);
  check('copying again keeps both, the second under another name', (await mine()).join() === 'Titre néon,Titre néon (2)' ? true : await mine());
  const stored = await stack.api('/studio-settings');
  check('the copies are stored on the server', Array.isArray(stored?.templates) && stored.templates.length === 2 ? true : stored);

  check('no error was reported by the page', errors.length === 0 ? true : errors.slice(0, 3));
}
