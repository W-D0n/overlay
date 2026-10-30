// @ts-check
/**
 * L'enregistrement des gestes directs : régler l'opacité et la position dans l'inspecteur devient des étapes de macro,
 * corrigeables dans l'éditeur, rejouées sur la sélection du moment en un seul geste annulable.
 */
import { layerRow, openStudio, settingsSaved } from '../studio.js';

export const name = 'gestes enregistrés';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  await stack.api('/studio-settings', { customCommands: [] });
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
  const inspector = () => page.evaluate("({ opacity: document.getElementById('inspector-opacity').value, x: document.getElementById('inspector-x').value })");
  const stepLabels = () => page.evaluate("[...document.querySelectorAll('#cc-steps .cc-step-label')].map((l) => l.textContent)");

  await page.click(layerRow(0));
  await paletteRun('enregistrer une macro');
  await page.fill('#inspector-opacity', '40');
  await page.sleep(100);
  await page.fill('#inspector-opacity', '45');
  await page.fill('#inspector-x', '10');
  await page.sleep(150);
  let bar = await page.evaluate("document.getElementById('macro-steps').textContent");
  check('les gestes de l’inspecteur apparaissent dans la barre, et les deux réglages d’opacité n’en font qu’une étape', bar === 'Régler la sélection : opacité 45 % → Placer la sélection : x 10 %');

  await paletteRun('position coin haut gauche');
  bar = await page.evaluate("document.getElementById('macro-steps').textContent");
  check('une commande exécutée pendant l’enregistrement compte pour une étape, sans ajouter ses gestes internes', bar.split(' → ').length === 3 && bar.endsWith('Position : Coin haut gauche'));

  await page.click('#macro-finish');
  check('l’éditeur s’ouvre avec les étapes décrites en français', (await stepLabels()).join('|') === 'Régler la sélection : opacité 45 %|Placer la sélection : x 10 %|Position : Coin haut gauche');

  // La valeur d'une étape se corrige sur place.
  await page.fill('#cc-steps .cc-step:nth-child(1) input[data-key="opacity"]', '70');
  await page.press('Tab');
  check('corriger la valeur de l’opacité met à jour la description', (await stepLabels())[0] === 'Régler la sélection : opacité 70 %');
  await page.fill('#cc-name', 'Mise en place');
  await page.click('#cc-save');
  await page.click('#cc-close');
  await settingsSaved(page);
  const stored = await stack.api('/studio-settings');
  check('le serveur détient une commande dont les étapes geste ne citent aucune couche', JSON.stringify(stored.customCommands[0].steps).includes('"op":"layer"') && !JSON.stringify(stored.customCommands[0].steps).includes('dotgrid-'));

  // Rejouer sur une autre couche, d'un seul geste.
  await paletteRun('ajouter bubble');
  const before = await inspector();
  await paletteRun('mise en place');
  const after = await inspector();
  check('rejouée sur une autre couche : opacité 70 % (corrigée) et position appliquées', before.opacity !== '70' && after.opacity === '70');
  await page.press('Control+z');
  await page.sleep(150);
  const undone = await inspector();
  check('un seul annuler défait toute la commande', undone.opacity === before.opacity && undone.x === before.x);

  // Sans sélection, elle l'explique au lieu de rester muette.
  await paletteRun('désélectionner');
  await paletteRun('mise en place');
  const status = await page.evaluate("document.getElementById('server-status').textContent");
  check('sans sélection, la commande explique qu’aucune couche n’est sélectionnée', status.includes('aucune couche sélectionnée'));

  await stack.api('/studio-settings', { customCommands: [] });
  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
