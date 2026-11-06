// @ts-check
/**
 * L'historique d'édition : liste des étapes avec ce qu'elles ont changé, comparaison à l'état actuel, retour à une étape
 * (sans rien perdre), puis avance jusqu'à la plus récente.
 */
import { layerRow, layerRows, openStudio } from '../studio.js';

export const name = 'historique d’édition';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  const paletteRun = async (/** @type {string} */ query) => {
    await page.press('Control+k');
    await page.fill('#palette-input', query);
    await page.press('Enter');
    await page.sleep(250);
  };
  const rows = () => page.evaluate("[...document.querySelectorAll('#edits-list .edit-row')].map((r) => ({ position: Number(r.dataset.position), state: r.dataset.state, label: r.querySelector('strong').textContent, summary: r.querySelector('.edit-row-summary').textContent, jumpDisabled: r.querySelector('[data-action=jump]').disabled }))");
  const summary = () => page.evaluate("document.getElementById('edits-summary').textContent");

  const initialRows = (await layerRows(page)).length;
  await page.click(layerRow(0));
  await page.fill('#inspector-opacity', '40');
  await page.press('Tab');
  await paletteRun('ajouter bubble');
  await page.fill('#inspector-opacity', '70');
  await page.press('Tab');
  await page.sleep(150);

  await page.click('#layers-history');
  check('le bouton ouvre la fenêtre d’historique', await page.evaluate("document.getElementById('edits-dialog').open"));
  let list = await rows();
  check('trois étapes plus l’état de départ, la plus récente en haut', list.length === 4 && list[0].position === 3 && list.at(-1).position === 0 && list.at(-1).label === 'État de départ');
  check('l’étape récente est « actuelle », le départ « départ »', list[0].state === 'current' && list.at(-1).state === 'start');
  check('chaque étape dit ce qu’elle a changé', list[1].summary.includes('Bubble') && list[2].summary !== '');
  check('l’étape actuelle ne propose pas de revenir sur elle-même', list[0].jumpDisabled === true && list[1].jumpDisabled === false);

  // Comparer : dit ce qu'un retour ferait, sans rien changer.
  await page.click('#edits-list .edit-row[data-position="1"] [data-action=compare]');
  const versus = await page.evaluate("document.querySelector('#edits-list .edit-row[data-position=\"1\"] .edit-row-versus').textContent");
  check('comparer annonce ce qu’un retour changerait par rapport à maintenant', versus.includes('changerait'));
  check('comparer ne modifie rien', (await layerRows(page)).length === initialRows + 1);

  // Revenir à la première étape : la couche ajoutée disparaît, rien n'est perdu.
  await page.click('#edits-list .edit-row[data-position="1"] [data-action=jump]');
  await page.sleep(200);
  check('revenir à l’étape 1 retire la couche ajoutée après elle', (await layerRows(page)).length === initialRows);
  list = await rows();
  check('les étapes suivantes restent listées, grisées comme défaites', list[0].state === 'undone' && list[1].state === 'undone' && list[2].state === 'current');
  check('le résumé compte les étapes défaites', (await summary()).includes('2 défaites'));

  // Avancer jusqu'à la plus récente.
  await page.click('#edits-list .edit-row[data-position="3"] [data-action=jump]');
  await page.sleep(200);
  check('avancer à la dernière étape rétablit tout', (await layerRows(page)).length === initialRows + 1 && (await rows())[0].state === 'current');

  // Un seul annuler : le retour est un déplacement dans l'historique, pas une réécriture.
  await page.click('#edits-close');
  await page.press('Control+z');
  await page.sleep(150);
  await page.click('#layers-history');
  check('annuler depuis le clavier recule d’une étape, l’historique le suit', (await rows())[1].state === 'current');
  await page.click('#edits-close');

  // Une nouvelle modification coupe le futur.
  await paletteRun('ajouter rain');
  await page.click('#layers-history');
  list = await rows();
  check('une nouvelle modification retire les étapes défaites', !list.some((r) => r.state === 'undone'));
  await page.press('Escape');

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
