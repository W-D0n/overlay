// @ts-check
/**
 * L'inspecteur de la sélection : unités, proportions, opacité, positions prédéfinies, alignement, répartition.
 */
import { addLayer, layerRow, layerRows, openStudio } from '../studio.js';

export const name = 'inspecteur de la sélection';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  const fields = () => page.evaluate(`({
    x: document.getElementById('inspector-x').value, y: document.getElementById('inspector-y').value,
    w: document.getElementById('inspector-width').value, h: document.getElementById('inspector-height').value,
    wPh: document.getElementById('inspector-width').placeholder, xPh: document.getElementById('inspector-x').placeholder,
    opacity: document.getElementById('inspector-opacity').value, preset: document.getElementById('inspector-preset').value,
    bodyHidden: document.getElementById('inspector-body').hidden, emptyHidden: document.getElementById('inspector-empty').hidden,
    undoTitle: document.getElementById('layers-undo').title,
    distDisabled: document.getElementById('distribute-h').disabled,
    refSelectionDisabled: document.querySelector('#inspector-reference option[value=selection]').disabled,
  })`);
  const stageWidth = () => page.evaluate("document.getElementById('bg-layer').getBoundingClientRect().width");
  const layerWidths = () => page.evaluate("[...document.getElementById('bg-layer').querySelectorAll('canvas')].map((c) => Math.round((c.parentElement ?? c).getBoundingClientRect().width))");

  let f = await fields();
  check('sans sélection : l’invite est visible, les champs cachés', f.emptyHidden === false && f.bodyHidden === true);

  await page.click(layerRow(1));
  f = await fields();
  check('une couche sélectionnée : 0 / 0 / 100 / 100 %, opacité 100', f.bodyHidden === false && f.x === '0' && f.y === '0' && f.w === '100' && f.h === '100' && f.opacity === '100');
  check('la position prédéfinie « Plein cadre » est reconnue', f.preset === 'full');

  await page.fill('#inspector-width', 50);
  f = await fields();
  const half = (await stageWidth()) / 2;
  check('largeur 50 % : le champ la garde, « moitié gauche » est reconnue', f.w === '50' && f.preset === 'half-left');
  check('l’aperçu montre la couche à la moitié de la toile', (await layerWidths()).some((/** @type {number} */ w) => Math.abs(w - half) <= 2));
  check('une seule entrée « Placer » malgré la frappe', f.undoTitle.includes('Placer'));
  await page.click('#layers-undo');
  check('un seul annuler remet la largeur à 100 %', (await fields()).w === '100');

  await page.click('#inspector-unit-pixel');
  f = await fields();
  check('en pixels : largeur 1920, hauteur 1080', f.w === '1920' && f.h === '1080');
  await page.fill('#inspector-width', 480);
  await page.click('#inspector-unit-percent');
  check('480 px = 25 % au retour en pourcentage', (await fields()).w === '25');

  await page.selectOption('#inspector-preset', 'full');
  await page.fill('#inspector-width', 50);
  await page.fill('#inspector-height', 50);
  // Le focus est dans un champ : cliquer ensuite sur le cadenas doit fonctionner (régression : clic perdu par redessin de l'icône).
  await page.click('#inspector-lock');
  check('le cadenas répond après une saisie dans un champ', (await page.evaluate("document.getElementById('inspector-lock').getAttribute('aria-pressed')")) === 'true');
  await page.fill('#inspector-width', 25);
  f = await fields();
  check('proportions liées : largeur 25 % → hauteur 25 % (rapport en pixels conservé)', f.w === '25' && f.h === '25');
  await page.click('#inspector-lock');

  await page.fill('#inspector-opacity', 40);
  const opacities = await page.evaluate(`[...document.getElementById('bg-layer').querySelectorAll('canvas')].map((c) => { let a = 1; for (let n = c; n && n.id !== 'bg-layer'; n = n.parentElement) a *= parseFloat(getComputedStyle(n).opacity); return Math.round(a * 100) / 100; })`);
  check('opacité 40 : la ligne l’affiche, l’aperçu aussi', (await layerRows(page))[1].sub.includes('40 %') && opacities.includes(0.4));

  await page.selectOption('#inspector-preset', 'pip-br');
  f = await fields();
  check('« Incrustation bas droit » : 72 / 70 / 25 / 25 %', f.x === '72' && f.y === '70' && f.w === '25' && f.h === '25');

  await page.click('#inspector-reset');
  f = await fields();
  check('réinitialiser : plein cadre et opaque, en une entrée', f.x === '0' && f.w === '100' && f.opacity === '100' && f.undoTitle.includes('Réinitialiser'));

  await addLayer(page, 'bubble');
  await page.selectOption('#inspector-preset', 'corner-br');
  await page.click(layerRow(2), { modifiers: ['Control'] });
  f = await fields();
  check('deux couches aux valeurs différentes : « Mixte », répartition indisponible, « la sélection » proposée', f.wPh === 'Mixte' && f.w === '' && f.distDisabled === true && f.refSelectionDisabled === false);
  await page.click('#align-left');
  f = await fields();
  check('aligner à gauche sur la toile : x identique pour les deux', f.x === '0' && f.xPh === '');
  await page.click('#layers-undo');
  check('un seul annuler défait l’alignement des deux couches', (await fields()).xPh === 'Mixte');

  await addLayer(page, 'rain');
  await page.click(layerRow(1));
  await page.click(layerRow(2), { modifiers: ['Control'] });
  await page.click(layerRow(3), { modifiers: ['Control'] });
  check('trois couches : la répartition devient disponible', (await fields()).distDisabled === false);

  await page.click(layerRow(1));
  await page.selectOption('#inspector-preset', 'pip-bl');
  await page.click('#publish-send');
  await page.sleep(700);
  const aired = (await stack.api('/state')).scene;
  const pip = aired.layers.find((/** @type {*} */ l) => Math.abs(l.placement.x - 0.03) < 1e-9);
  check('publié : le placement part dans la scène de l’antenne', pip !== undefined && Math.abs(pip.placement.width - 0.25) < 1e-9);

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
