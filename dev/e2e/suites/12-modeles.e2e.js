// @ts-check
/**
 * Les modèles de couches : enregistrer la sélection sous un nom, la retrouver après vidage du navigateur (réglages
 * serveur), l'insérer en un seul geste annulable, renommer, supprimer.
 */
import { layerRow, layerRows, openStudio } from '../studio.js';

export const name = 'modèles de couches';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  await stack.api('/studio-settings', { templates: [] });
  await page.evaluate('localStorage.clear()');
  await page.goto(`http://localhost:${stack.staticPort}/dev/studio.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.waitFor("document.querySelectorAll('#layers-list .layer-row').length > 0", 10_000);
  await page.sleep(400);

  const paletteRun = async (/** @type {string} */ query) => {
    await page.press('Control+k');
    await page.fill('#palette-input', query);
    await page.press('Enter');
    await page.sleep(250);
  };
  const cards = () => page.evaluate("[...document.querySelectorAll('#templates-list .tpl-card')].map((c) => ({ id: c.dataset.id, name: c.querySelector('strong, input')?.value ?? c.querySelector('strong').textContent, summary: c.querySelector('.tpl-summary')?.textContent ?? null }))");

  // Une scène à deux couches : la couche de départ et une couche ajoutée, réglée.
  await paletteRun('ajouter bubble');
  await page.fill('#inspector-opacity', '55');
  await page.press('Tab');
  await page.sleep(150);

  // Sans sélection, on ne peut pas enregistrer.
  await paletteRun('désélectionner');
  await paletteRun('modèles de couches');
  check('la fenêtre s’ouvre depuis la palette', await page.evaluate("document.getElementById('templates-dialog').open"));
  await page.fill('#templates-name', 'Mon fond');
  check('sans sélection, « Enregistrer » est désactivé et le dit', await page.evaluate("document.getElementById('templates-save').disabled && document.getElementById('templates-error').textContent.includes('sélectionnez')"));
  await page.click('#templates-close');

  // Sélectionner tout, enregistrer.
  await paletteRun('tout sélectionner');
  await paletteRun('enregistrer la sélection comme modèle');
  check('la commande ouvre la fenêtre sur le champ du nom', await page.evaluate("document.activeElement?.id === 'templates-name'"));
  await page.fill('#templates-name', 'Mon fond');
  check('avec une sélection et un nom, « Enregistrer » est actif', await page.evaluate("!document.getElementById('templates-save').disabled"));
  await page.click('#templates-save');
  let list = await cards();
  check('le modèle apparaît avec le détail de ses couches', list.length === 1 && list[0].name === 'Mon fond' && /^\d+ couches? :/.test(list[0].summary));

  // Un nom déjà pris est refusé.
  await page.fill('#templates-name', 'mon FOND');
  check('un nom déjà pris est refusé, sans tenir compte de la casse', await page.evaluate("document.getElementById('templates-save').disabled && document.getElementById('templates-error').textContent.includes('déjà')"));
  await page.fill('#templates-name', '');
  await page.click('#templates-close');

  // Le serveur le détient : il survit au vidage du navigateur.
  await page.sleep(700);
  const stored = await stack.api('/studio-settings');
  const count = stored.templates[0]?.layers.length ?? 0;
  check('le serveur détient le modèle, avec les couches sélectionnées et leurs réglages', stored.templates.length === 1 && count >= 2 && stored.templates[0].layers.some((l) => l.opacity === 0.55));
  await page.evaluate('localStorage.clear()');
  await page.goto(`http://localhost:${stack.staticPort}/dev/studio.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.sleep(500);

  // Insérer dans la scène : un seul geste annulable.
  const before = (await layerRows(page)).length;
  await paletteRun('modèles de couches');
  list = await cards();
  check('après vidage du navigateur, le modèle est toujours là', list.length === 1 && list[0].name === 'Mon fond');
  await page.click('#templates-list .tpl-card [data-action=insert]');
  await page.sleep(250);
  check('la fenêtre se ferme et les couches du modèle sont ajoutées', !(await page.evaluate("document.getElementById('templates-dialog').open")) && (await layerRows(page)).length > before && (await layerRows(page)).length <= before + count);
  await page.press('Control+z');
  await page.sleep(150);
  check('un seul annuler retire tout le modèle', (await layerRows(page)).length === before);

  // Renommer, puis supprimer avec confirmation.
  await paletteRun('modèles de couches');
  await page.click('#templates-list .tpl-card [data-action=rename]');
  await page.fill('#templates-list .tpl-card input', 'Fond du soir');
  await page.press('Enter');
  list = await cards();
  check('renommer change le nom', list[0].name === 'Fond du soir');
  await page.click('#templates-list .tpl-card [data-action=remove]');
  check('supprimer demande confirmation', await page.evaluate("!!document.querySelector('#templates-list [data-action=remove-confirm]')"));
  await page.click('#templates-list [data-action=remove-cancel]');
  check('« Non » conserve le modèle', (await cards()).length === 1);
  await page.click('#templates-list .tpl-card [data-action=remove]');
  await page.click('#templates-list [data-action=remove-confirm]');
  check('« Oui » le supprime et la liste vide s’affiche', (await cards()).length === 0 && (await page.evaluate("!document.getElementById('templates-empty').hidden")));
  await page.click('#templates-close');
  await page.sleep(700);
  check('le serveur n’en garde plus', (await stack.api('/studio-settings')).templates.length === 0);

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
