// @ts-check
/**
 * Le panneau de couches, aux vrais gestes : clics, glisser-déposer, frappe, clavier.
 */
import { addLayer, layerRow, layerRows, layerTitles, openStudio, panelState } from '../studio.js';

export const name = 'panneau de couches';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  const air = async () => (await stack.api('/state')).scene;
  const totalCanvases = () => page.evaluate("document.getElementById('bg-layer').querySelectorAll('canvas').length");

  let rows = await layerRows(page);
  let ui = await panelState(page);
  check('deux lignes : le branding en tête, l’effet dessous', rows.length === 2 && rows[0].id === 'branding' && rows[1].title === 'DotGrid');
  check('jauge 2 / 8, rien à annuler, en antenne', ui.gauge === '2 / 8' && ui.level === 'ok' && ui.undoDisabled === true && ui.bar === 'live');
  check('le panneau d’effet dit quelle couche il règle', ui.target.includes('DotGrid'));
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-row')].map((r) => r.querySelector('.preset-thumb')?.dataset.state ?? (r.querySelector('.layer-thumb-identity') ? 'identity' : 'none')).join() === 'identity,ready'", 15_000);
  check('la vignette de l’effet est prête, celle du branding est une icône', (await layerRows(page)).map((/** @type {*} */ row) => row.thumb).join() === 'identity,ready');

  await page.click('#layers-add');
  const cards = await page.evaluate("[...document.querySelectorAll('#gallery-grid .gallery-card')].map((c) => ({ kind: c.dataset.kind, disabled: c.disabled }))");
  check('la galerie propose 11 effets, le texte, la forme, l’image et le branding (désactivé : déjà présent)', cards.length === 15 && cards.find((/** @type {*} */ c) => c.kind === 'branding')?.disabled === true && cards.filter((/** @type {*} */ c) => !c.disabled).length === 14);
  await page.click('#gallery-grid [data-kind="bubble"]');
  await page.sleep(400);
  rows = await layerRows(page);
  ui = await panelState(page);
  check('Bubble est ajoutée au-dessus de DotGrid et sélectionnée', (await layerTitles(page)) === 'Branding,Bubble,DotGrid' && rows[1].selected === true);
  check('jauge 3 / 8, brouillon, annulation disponible (« Ajouter une couche »)', ui.gauge === '3 / 8' && ui.bar === 'draft' && ui.undoDisabled === false && ui.undoTitle.includes('Ajouter une couche'));
  check('le panneau d’effet règle maintenant Bubble', ui.target.includes('Bubble'));

  const before = await totalCanvases();
  await page.click(`${layerRow(1)} .layer-visible`);
  rows = await layerRows(page);
  check('masquer : la ligne est estompée', rows[1].hidden === true);
  check('masquer : l’effet est démonté — un canvas de moins dans l’aperçu (il ne dessine plus rien)', (await totalCanvases()) === before - 1);
  await page.click(`${layerRow(1)} .layer-visible`);
  await page.sleep(200);
  check('démasquer : l’effet est remonté', (await totalCanvases()) === before);
  await page.click(`${layerRow(1)} .layer-lock`);
  check('verrouiller : la ligne porte le cadenas', (await layerRows(page))[1].locked === true);

  await page.dblclick(`${layerRow(1)} .layer-title`);
  await page.fill('.layer-rename', 'Mes bulles');
  await page.press('Enter');
  rows = await layerRows(page);
  check('renommer : le titre change, le type reste en sous-titre', rows[1].title === 'Mes bulles' && rows[1].sub.startsWith('Bubble'));
  await page.dblclick(`${layerRow(1)} .layer-title`);
  await page.fill('.layer-rename', 'Abandonné');
  await page.press('Escape');
  check('Échap abandonne le renommage', (await layerRows(page))[1].title === 'Mes bulles');

  const target = await page.boxOf(layerRow(2));
  await page.drag(layerRow(1), layerRow(2), { position: { x: target.width / 2, y: target.height - 3 } });
  check('glisser « Mes bulles » sous DotGrid', (await layerTitles(page)) === 'Branding,DotGrid,Mes bulles');
  await page.drag(layerRow(1), layerRow(0), { position: { x: 40, y: 2 } });
  check('déposer un effet au-dessus du branding est refusé : le branding reste en tête', (await layerTitles(page)) === 'Branding,DotGrid,Mes bulles');

  await page.click('#layers-undo');
  check('annuler (bouton) défait le glisser', (await layerTitles(page)) === 'Branding,Mes bulles,DotGrid');
  await page.click('#layers-redo');
  check('rétablir le rejoue', (await layerTitles(page)) === 'Branding,DotGrid,Mes bulles');
  await page.click('body', { position: { x: 5, y: 600 } });
  await page.press('Control+z');
  check('Ctrl+Z hors champ annule aussi', (await layerTitles(page)) === 'Branding,Mes bulles,DotGrid');
  await page.press('Control+Shift+z');
  check('Ctrl+Maj+Z rétablit', (await layerTitles(page)) === 'Branding,DotGrid,Mes bulles');

  await page.click(layerRow(2));
  await page.click('#layers-solo');
  rows = await layerRows(page);
  ui = await panelState(page);
  check('solo : les autres lignes sont estompées, l’aperçu ne montre que la couche isolée', rows[1].dimmed && rows[0].dimmed && !rows[2].dimmed && ui.canvases <= 2);
  check('le solo n’ajoute aucune entrée d’annulation', ui.undoTitle.includes('Réordonner'));
  await page.click('#layers-solo');

  await page.click('#publish-send');
  await page.sleep(700);
  const aired = await air();
  check('publié : ordre, nom et verrou sont dans la scène de l’antenne', aired.layers.map((/** @type {*} */ l) => l.name ?? l.kind).join() === 'Mes bulles,dotgrid,branding' && aired.layers[0].locked === true);
  check('le solo n’est pas parti (toutes les couches visibles)', aired.layers.every((/** @type {*} */ l) => l.visible));

  await page.click(layerRow(1));
  await page.click(layerRow(2), { modifiers: ['Control'] });
  check('Ctrl+clic ajoute à la sélection', (await layerRows(page)).filter((/** @type {*} */ x) => x.selected).length === 2);
  await page.click(layerRow(0), { modifiers: ['Shift'] });
  check('Maj+clic étend en plage', (await layerRows(page)).filter((/** @type {*} */ x) => x.selected).length === 3);
  await page.click(layerRow(1));
  await page.focus('#layers-list');
  await page.press('Control+d');
  rows = await layerRows(page);
  check('Ctrl+D duplique la couche sélectionnée, la copie est seule sélectionnée', rows.length === 4 && rows.filter((/** @type {*} */ x) => x.selected).length === 1);
  await page.press('Delete');
  check('Suppr supprime la sélection', (await layerRows(page)).length === 3);
  await page.press('Alt+ArrowUp');
  check('Alt+↑ réordonne la couche sélectionnée sans en perdre', (await layerRows(page)).length === 3);

  for (let i = 0; i < 6 && !(await panelState(page)).addDisabled; i += 1) await addLayer(page, 'rain');
  ui = await panelState(page);
  check('à 8 couches : jauge pleine, bouton Ajouter désactivé', ui.gauge === '8 / 8' && ui.level === 'full' && ui.addDisabled === true);

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
