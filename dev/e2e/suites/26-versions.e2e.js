// @ts-check
/**
 * Les versions nommées d'une scène : on enregistre l'état du brouillon sous un nom, on en enregistre un autre, on restaure (en une
 * entrée d'historique annulable, sans rien publier), on renomme, on supprime ; les versions survivent au rechargement.
 */
import { openStudio } from '../studio.js';

export const name = 'versions de scène';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });

  const titles = () => page.evaluate("[...document.querySelectorAll('#layers-list .layer-title')].map((t) => t.textContent).join()");
  const versions = () => page.evaluate("[...document.querySelectorAll('#versions-list .version-item')].map((item) => ({ name: item.querySelector('.version-name')?.textContent ?? item.querySelector('input')?.value, summary: item.querySelector('.version-summary')?.textContent ?? '' }))");
  const status = () => page.evaluate("document.getElementById('versions-status').textContent");
  const addLayer = async (/** @type {string} */ kind, /** @type {string} */ title) => {
    await page.click('#layers-add');
    await page.click(`#gallery-grid [data-kind="${kind}"]`);
    await page.waitFor(`[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === ${JSON.stringify(title)})`, 8000);
  };
  const open = async () => {
    await page.click('#layers-versions');
    await page.waitFor("document.getElementById('versions-dialog').open", 5000);
    await page.sleep(300);
  };
  const save = async (/** @type {string} */ label) => {
    await page.fill('#versions-name', label);
    await page.click('#versions-save');
    await page.sleep(500);
  };

  await addLayer('text', 'Texte');
  const withTitle = await titles();
  await open();
  check('sans version, la fenêtre invite à en créer une', (await page.evaluate("document.querySelector('#versions-list .version-empty')?.textContent ?? ''")).includes('Aucune version'));
  check('le titre dit de quelle scène il s’agit', (await page.evaluate("document.getElementById('versions-title').textContent")).startsWith('Versions de'));
  await save('Avec titre');
  let list = await versions();
  check('la version est gardée sous son nom, identique à la scène en cours', list.length === 1 && list[0].name === 'Avec titre' && list[0].summary.includes('identique à la scène en cours'));
  check('le champ du nom est vidé après l’enregistrement', (await page.evaluate("document.getElementById('versions-name').value")) === '');

  await save('Avec titre');
  check('un nom déjà pris est refusé, avec la raison', (await status()).includes('déjà') && (await versions()).length === 1);
  await page.fill('#versions-name', '');
  await page.click('#versions-save');
  await page.sleep(300);
  check('un nom vide est refusé', (await status()).includes('obligatoire'));
  await page.click('#versions-close');

  await addLayer('shape', 'Forme');
  const withShape = await titles();
  await open();
  list = await versions();
  check('devant une scène plus riche, la version dit ce que restaurer retirerait', list[0].summary.includes('retire 1 couche'));
  await save('Avec titre et forme');
  list = await versions();
  check('la plus récente est en tête', list.map((version) => version.name).join() === 'Avec titre et forme,Avec titre');

  // Restaurer : le brouillon revient à « Avec titre », rien n'est publié, un Ctrl+Z défait.
  const airedBefore = (await stack.api('/state')).scene.layers.length;
  await page.click('#versions-list .version-item:nth-child(2) [data-action="restore"]');
  await page.waitFor("!document.getElementById('versions-dialog').open", 5000);
  await page.sleep(500);
  check('restaurer remet les couches de la version dans le brouillon et ferme la fenêtre', (await titles()) === withTitle);
  check('et rien n’est publié', (await stack.api('/state')).scene.layers.length === airedBefore);
  check('l’historique d’édition nomme la restauration', (await page.evaluate("document.getElementById('layers-undo').title")).includes('Restaurer la version'));
  await page.click('#layers-undo');
  await page.sleep(400);
  check('un seul annuler rend la scène d’avant', (await titles()) === withShape);

  // Renommer, supprimer.
  await open();
  await page.click('#versions-list .version-item:nth-child(2) [data-action="rename"]');
  await page.fill('#versions-list .version-item input', 'Titre seul');
  await page.press('Enter');
  await page.waitFor("[...document.querySelectorAll('#versions-list .version-name')].some((n) => n.textContent === 'Titre seul')", 5000);
  check('renommer change le nom sur place', (await versions()).map((version) => version.name).join() === 'Avec titre et forme,Titre seul');

  await page.click('#versions-list .version-item:nth-child(1) [data-action="remove"]');
  check('la suppression demande une confirmation', (await page.evaluate("document.querySelector('#versions-list .version-item:nth-child(1) [data-action=remove]').textContent")) === 'Confirmer ?' && (await versions()).length === 2);
  await page.click('#versions-list .version-item:nth-child(1) [data-action="remove"]');
  await page.waitFor("document.querySelectorAll('#versions-list .version-item').length === 1", 5000);
  check('confirmer la supprime', (await versions()).map((version) => version.name).join() === 'Titre seul');
  await page.click('#versions-close');

  // Rechargement : la version vit sur le serveur.
  await page.goto(`http://localhost:${stack.staticPort}/dev/studio.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.waitFor("document.querySelectorAll('#layers-list .layer-row').length > 0", 10_000);
  await page.waitFor("!!document.getElementById('layers-versions')", 5000);
  await open();
  check('après rechargement, la version est toujours là', (await versions()).map((version) => version.name).join() === 'Titre seul');
  await page.click('#versions-close');

  // La palette de commandes.
  await page.press('Control+k');
  await page.fill('#palette-input', 'versions');
  await page.sleep(300);
  await page.press('Enter');
  check('la palette de commandes ouvre les versions', (await page.waitFor("document.getElementById('versions-dialog').open", 5000)) === true);

  check('aucune erreur inattendue dans la console', (() => {
    // Les refus voulus (nom pris, nom vide) sont des 4xx que Chrome journalise : attendus, le reste ne l'est pas.
    const unexpected = errors.filter((/** @type {string} */ message) => !message.includes('/versions'));
    return unexpected.length === 0 ? true : unexpected;
  })());
}
