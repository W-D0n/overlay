// @ts-check
/**
 * Les commandes : palette, aide, raccourcis globaux, presse-papiers, menu contextuel, changements, avant / après, test de
 * transition.
 */
import { addLayer, layerRow, layerRows, layerTitles, openStudio, panelState } from '../studio.js';

export const name = 'commandes et publication';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  const air = async () => (await stack.api('/state')).scene;
  const count = async () => (await layerRows(page)).length;
  const palette = () => page.evaluate("(() => { const dialog = document.getElementById('command-palette'); return { open: dialog.open, items: [...document.querySelectorAll('#palette-list .palette-item')].map((li) => ({ text: li.querySelector('.palette-label').textContent, disabled: li.classList.contains('is-disabled'), active: li.classList.contains('is-active') })) }; })()");

  // Palette.
  await page.click('#canvas-overlay', { position: { x: 5, y: 5 } });
  await page.press('Control+k');
  let state = await palette();
  check('Ctrl+K ouvre la palette avec toutes les commandes', state.open === true && state.items.length > 50);
  await page.fill('#palette-input', 'aligner gauche');
  state = await palette();
  check('la recherche par mots filtre : « Aligner à gauche » arrive en tête', state.items.length >= 1 && state.items[0].text === 'Aligner à gauche');
  check('une commande indisponible (aucune couche sélectionnée) est visible mais grisée', state.items[0].disabled === true);
  await page.fill('#palette-input', 'coller');
  state = await palette();
  check('la palette cherche sans tenir compte des accents ni de la casse', (await (async () => { await page.fill('#palette-input', 'ÉCHAP'); return true; })()) && state.items.some((/** @type {*} */ item) => item.text.startsWith('Coller')));
  await page.press('Escape');
  check('Échap ferme la palette', (await palette()).open === false);

  // Exécuter depuis la palette : ajouter un effet.
  await page.press('Control+k');
  await page.fill('#palette-input', 'ajouter bubble');
  await page.press('Enter');
  await page.sleep(300);
  check('Entrée exécute la commande en tête : une couche « Bubble » est ajoutée', (await layerTitles(page)).includes('Bubble') && (await count()) === 3);

  // Aide.
  await page.click('#canvas-overlay', { position: { x: 5, y: 5 } });
  await page.press('Shift+?');
  const help = await page.evaluate("({ open: document.getElementById('shortcuts-help').open, text: document.getElementById('help-body').textContent })");
  check('« ? » ouvre l’aide avec les raccourcis et les gestes de souris', help.open === true && help.text.includes('Ctrl+K') && help.text.includes('Alt + clic'));
  await page.click('#help-close');

  // Presse-papiers de couches.
  await page.click(layerRow(1));
  await page.press('Control+c');
  await page.press('Control+v');
  await page.sleep(200);
  check('Ctrl+C puis Ctrl+V colle une copie de la couche', (await count()) === 4);
  const before = await count();
  await page.click('#inspector-x');
  await page.press('Control+v');
  check('dans un champ de saisie, Ctrl+V reste au champ : aucune couche collée', (await count()) === before);
  await page.click(layerRow(1));
  await page.press('Control+x');
  check('Ctrl+X coupe la couche', (await count()) === 3);
  await page.press('Control+z');
  check('et Ctrl+Z la rend', (await count()) === 4);

  // Style : on règle l'opacité d'une couche, on copie son style, on le colle sur une autre.
  await page.click(layerRow(2));
  await page.fill('#inspector-opacity', 30);
  await page.click(layerRow(2));
  await page.press('Control+Alt+c');
  await page.click(layerRow(3));
  const untouched = (await layerRows(page))[3].sub;
  await page.press('Control+Alt+v');
  const pasted = (await layerRows(page))[3].sub;
  check('copier le style d’une couche puis le coller sur une autre y reporte l’opacité (30 %)', !untouched.includes('30 %') && pasted.includes('30 %'));

  // Ordre au clavier.
  await page.click(layerRow(3));
  const titlesBefore = await layerTitles(page);
  await page.press('Control+]');
  check('Ctrl+] monte la couche d’un cran', (await layerTitles(page)) !== titlesBefore);

  // Menu contextuel.
  const rowBox = await page.boxOf(layerRow(2));
  await page.click(layerRow(2));
  await page.evaluate(`document.querySelector(${JSON.stringify(layerRow(2))}).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: ${Math.round(rowBox.x + 40)}, clientY: ${Math.round(rowBox.y + 10)} }))`);
  const menu = await page.evaluate("({ open: !document.getElementById('context-menu').hidden, items: [...document.querySelectorAll('#context-menu .context-item')].map((b) => ({ text: b.textContent, disabled: b.disabled })) })");
  check('le clic droit sur une couche ouvre le menu de ses commandes, avec raccourcis', menu.open === true && menu.items.length >= 12 && menu.items.some((/** @type {*} */ item) => item.text.includes('Dupliquer') && item.text.includes('Ctrl+D')));
  const beforeDup = await count();
  await page.click('#context-menu .context-item:nth-child(4)');
  await page.sleep(200);
  check('choisir une entrée du menu l’exécute et le ferme', (await count()) === beforeDup + 1 && (await page.evaluate("document.getElementById('context-menu').hidden")) === true);
  await page.evaluate(`document.querySelector('#canvas-overlay').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }))`);
  await page.press('Escape');
  check('Échap ferme le menu', (await page.evaluate("document.getElementById('context-menu').hidden")) === true);

  // Changements, avant / après, test de transition, publication au clavier.
  await page.click('#publish-discard');
  await page.sleep(300);
  check('après abandon : plus de brouillon, le bouton des changements est masqué', (await page.evaluate("document.getElementById('publish-changes').hidden")) === true);
  await page.click(layerRow(1));
  await page.fill('#inspector-opacity', 55);
  await page.sleep(200);
  const summary = await page.evaluate("document.getElementById('publish-changes').textContent");
  check('un réglage : « 1 changement » dans la barre de publication', summary === '1 changement');
  await page.click('#publish-changes');
  const dialog = await page.evaluate("({ open: document.getElementById('changes-dialog').open, text: document.getElementById('changes-list').textContent })");
  check('le récapitulatif liste la couche et ce qui change (opacité 100 % → 55 %)', dialog.open === true && dialog.text.includes('opacité : 100 % → 55 %'));
  await page.click('#changes-close');

  const draftCanvases = (await panelState(page)).canvases;
  await page.press('Control+b');
  const comparing = await page.evaluate("document.getElementById('stage-area').classList.contains('is-comparing')");
  check('Ctrl+B montre l’antenne à la place du brouillon (badge « Antenne »)', comparing === true);
  await page.press('Control+b');
  check('Ctrl+B de nouveau revient au brouillon', (await page.evaluate("document.getElementById('stage-area').classList.contains('is-comparing')")) === false && (await panelState(page)).canvases === draftCanvases);

  const airBefore = JSON.stringify(await air());
  await page.click('#publish-test');
  await page.sleep(700);
  check('tester la transition ne touche ni à l’antenne ni au brouillon', JSON.stringify(await air()) === airBefore && (await panelState(page)).bar === 'draft');

  await page.press('Control+Enter');
  await page.sleep(600);
  const published = await air();
  check('Ctrl+Entrée publie le brouillon', (await panelState(page)).bar === 'live' && published.layers.some((/** @type {*} */ l) => l.opacity === 0.55));

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
