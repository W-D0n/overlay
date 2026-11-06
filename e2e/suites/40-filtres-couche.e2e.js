// @ts-check
/**
 * Les filtres d'une couche : on règle des couleurs (luminosité, contraste, saturation, teinte) et une lueur dans l'inspecteur, et l'aperçu les porte — le filtre CSS lu sur le calque
 * réel est celui du réglage. Une valeur neutre n'est pas écrite ; annuler, publier, réinitialiser et recharger se suivent.
 */
import { layerRow, openStudio } from '../studio.js';

export const name = 'filtres de couche';

const CALQUE = "([...document.getElementById('bg-layer').querySelectorAll('canvas')].filter((c) => c.parentElement.id !== 'bg-layer').at(-1).parentElement)";
const NUMBER = (/** @type {string} */ key) => `#filters-body [data-filter="${key}"] input[type="number"]`;
const RANGE = (/** @type {string} */ key) => `#filters-body [data-filter="${key}"] input[type="range"]`;

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });

  const filter = () => page.evaluate(`getComputedStyle(${CALQUE}).filter`);
  const numberValue = (/** @type {string} */ key) => page.evaluate(`document.querySelector(${JSON.stringify(NUMBER(key))}).value`);
  const glowOn = () => page.evaluate("document.querySelector('#filters-body [data-filter=\"glow\"] input[type=\"checkbox\"]').checked");
  const glowDisabled = () => page.evaluate("[...document.querySelectorAll('#filters-body [data-filter=\"glow\"] input:not([type=\"checkbox\"])')].every((field) => field.disabled)");

  await page.click('#layers-add');
  await page.click('#gallery-grid [data-kind="text"]');
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Texte')", 8000);
  await page.sleep(400);

  check('une couche neuve n\'a aucun filtre : valeurs neutres, lueur éteinte et ses réglages grisés', (await numberValue('brightness')) === '1' && (await numberValue('contrast')) === '1' && (await numberValue('saturation')) === '1' && (await numberValue('hue')) === '0' && (await glowOn()) === false && (await glowDisabled()) === true);
  check('et aucun filtre sur le calque', (await filter()) === 'none');

  // Les réglages de couleur.
  await page.fill(NUMBER('brightness'), 1.5);
  check('la luminosité à 1,5 est portée par le calque', (await filter()) === 'brightness(1.5)' ? true : await filter());
  check('et le curseur suit le nombre', (await page.evaluate(`document.querySelector(${JSON.stringify(RANGE('brightness'))}).value`)) === '1.5');
  await page.fill(NUMBER('hue'), -60);
  check('la teinte à -60° s\'ajoute, après la luminosité', (await filter()) === 'brightness(1.5) hue-rotate(-60deg)' ? true : await filter());
  await page.fill(NUMBER('saturation'), 0);
  await page.fill(NUMBER('contrast'), 1.2);
  check('contraste et saturation : l\'ordre est luminosité, contraste, saturation, teinte', (await filter()) === 'brightness(1.5) contrast(1.2) saturate(0) hue-rotate(-60deg)' ? true : await filter());
  await page.fill(NUMBER('brightness'), 9);
  await page.press('Tab');
  check('une valeur hors bornes (9 saisis) est ramenée à la borne : 2', (await numberValue('brightness')) === '2' && (await filter()).startsWith('brightness(2)') ? true : [await numberValue('brightness'), await filter()]);

  // Le curseur et le nombre se suivent.
  const rangeSet = (/** @type {string} */ key, /** @type {number} */ value) => page.evaluate(`(() => { const slider = document.querySelector(${JSON.stringify(RANGE(key))}); slider.value = ${value}; slider.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await rangeSet('contrast', 0.5);
  check('déplacer le curseur règle le nombre et le calque', (await numberValue('contrast')) === '0.5' && (await filter()).includes('contrast(0.5)') ? true : [await numberValue('contrast'), await filter()]);

  // Remettre à la valeur neutre retire le réglage.
  await page.fill(NUMBER('brightness'), 1);
  await page.fill(NUMBER('contrast'), 1);
  await page.fill(NUMBER('saturation'), 1);
  await page.fill(NUMBER('hue'), 0);
  check('remettre chaque réglage à sa valeur neutre ne laisse aucun filtre', (await filter()) === 'none' ? true : await filter());

  // La lueur.
  await page.click('#filters-body [data-filter="glow"] input[type="checkbox"]');
  check('allumer la lueur dégrise ses réglages et pose le halo de départ', (await glowOn()) === true && (await glowDisabled()) === false);
  const lit = await filter();
  check('le calque porte un halo : ombre sans décalage, couleur d\'accent, 80 %', lit.includes('drop-shadow(') && lit.includes('rgba(200, 185, 122, 0.8)') ? true : lit);
  await page.evaluate("(() => { const color = document.querySelector('#filters-body [data-filter=\"glow\"] input[type=\"color\"]'); color.value = '#ff0000'; color.dispatchEvent(new Event('input', { bubbles: true })); })()");
  check('changer la couleur change le halo', (await filter()).includes('rgb(255, 0, 0)') || (await filter()).includes('rgba(255, 0, 0') ? true : await filter());
  await page.fill(NUMBER('glow-intensity'), 0.4);
  check('l\'intensité règle l\'opacité du halo', (await filter()).includes('0.4') ? true : await filter());
  await page.fill(NUMBER('glow-size'), 0);
  await page.press('Tab');
  check('une portée nulle éteint la lueur : case décochée, réglages grisés, plus de halo', (await glowOn()) === false && (await glowDisabled()) === true && !(await filter()).includes('drop-shadow') ? true : [await glowOn(), await filter()]);
  await page.click('#filters-body [data-filter="glow"] input[type="checkbox"]');
  check('la rallumer repart du halo de départ, pas de l\'ancienne couleur', (await filter()).includes('rgba(200, 185, 122, 0.8)') ? true : await filter());

  // Décocher la case éteint la lueur ; éteinte, ses réglages montrent le halo de départ, prêt à être rallumé.
  const GLOW_BOX = '#filters-body [data-filter="glow"] input[type="checkbox"]';
  await page.click(GLOW_BOX);
  check('décocher la case éteint la lueur : plus de halo, réglages grisés', (await glowOn()) === false && (await glowDisabled()) === true && !(await filter()).includes('drop-shadow') ? true : [await glowOn(), await filter()]);
  check("éteinte, la lueur montre son halo de départ : couleur d'accent, portée 16", (await page.evaluate("document.querySelector('#filters-body [data-filter=\"glow\"] input[type=\"color\"]').value")) === '#c8b97a' && (await numberValue('glow-size')) === '16' ? true : [await numberValue('glow-size')]);
  await page.click(GLOW_BOX);

  // Les filtres et le flou se composent : le flou vient après.
  await page.fill('#inspector-blur', 4);
  const both = await filter();
  check('le flou vient après les filtres : le halo est flouté avec le reste', both.includes('drop-shadow(') && both.indexOf('blur(') > both.indexOf('drop-shadow(') ? true : both);

  // Annuler défait un réglage.
  await page.fill(NUMBER('hue'), 90);
  check('la teinte à 90° est posée', (await filter()).includes('hue-rotate(90deg)'));
  await page.click('#layers-undo');
  await page.sleep(250);
  check('annuler retire la teinte', !(await filter()).includes('hue-rotate') && (await numberValue('hue')) === '0' ? true : [await filter(), await numberValue('hue')]);

  // Publier et retrouver.
  await page.fill(NUMBER('saturation'), 1.4);
  await page.click('#publish-send');
  await page.waitFor("document.getElementById('publish-bar').dataset.state === 'live'", 8000);
  const aired = (await stack.api('/state')).scene.layers.find((/** @type {*} */ layer) => layer.kind === 'text');
  check('publié : les filtres sont dans la scène de l\'antenne, sans les valeurs neutres', aired?.filters?.saturation === 1.4 && aired.filters.glow?.color === '#c8b97a' && aired.filters.glow.size === 16 && aired.filters.hue === undefined && aired.filters.brightness === undefined ? true : aired?.filters);

  await page.goto(`http://localhost:${stack.staticPort}/studio/index.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Texte')", 10_000);
  await page.click('#layers-list .layer-row:nth-child(2)');
  await page.waitFor(`document.querySelector(${JSON.stringify(NUMBER('saturation'))}).value === '1.4'`, 8000);
  check('après rechargement, les filtres sont retrouvés, nombre et curseur', (await glowOn()) === true && (await numberValue('saturation')) === '1.4' && (await page.evaluate(`document.querySelector(${JSON.stringify(RANGE('saturation'))}).value`)) === '1.4');

  // Réinitialiser remet la couche à zéro, filtres compris.
  await page.click('#inspector-reset');
  await page.sleep(300);
  check('« Réinitialiser » retire les filtres', (await filter()) === 'none' && (await glowOn()) === false && (await numberValue('saturation')) === '1' ? true : [await filter(), await glowOn()]);

  // Plusieurs couches : la section se tait.
  await page.click('#layers-add');
  await page.click('#gallery-grid [data-kind="shape"]');
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].length >= 3", 8000);
  await page.sleep(300);
  const textRow = await page.evaluate("[...document.querySelectorAll('#layers-list .layer-row')].findIndex((row) => row.querySelector('.layer-title')?.textContent === 'Texte')");
  const otherRow = await page.evaluate("[...document.querySelectorAll('#layers-list .layer-row')].findIndex((row) => row.querySelector('.layer-title')?.textContent !== 'Texte')");
  await page.click(layerRow(textRow));
  await page.click(layerRow(otherRow), { modifiers: ['Control'] });
  check('avec plusieurs couches sélectionnées, rien n\'est proposé et la raison est dite', (await page.evaluate("document.getElementById('filters-body').hidden")) === true && (await page.evaluate("document.getElementById('filters-hint').textContent")).includes('une seule couche'));

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
