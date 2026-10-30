// @ts-check
/**
 * Régler une valeur en glissant sur son étiquette, ou au clavier avec Maj / Alt : inspecteur, curseur d'opacité et réglages
 * d'effet. Un glisser est un seul geste d'historique ; Échap le rend.
 */
import { layerRow, openStudio } from '../studio.js';

export const name = 'valeurs au glisser';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  await stack.api('/studio-settings', { preferences: { 'placement.unit': 'percent' } });
  await page.click(layerRow(0));
  await page.sleep(200);
  // Une couche plein cadre ne peut pas bouger : on la réduit pour que la position soit réglable.
  await page.fill('#inspector-width', '50');
  await page.press('Tab');
  await page.sleep(150);

  const value = (/** @type {string} */ selector) => page.evaluate(`Number(document.querySelector(${JSON.stringify(selector)}).value)`);
  const drag = async (/** @type {string} */ labelSelector, /** @type {number} */ dx, /** @type {{ modifiers?: string[], cancel?: boolean }} */ options = {}) => {
    const box = await page.boxOf(labelSelector);
    const x = box.x + 6;
    const y = box.y + Math.min(6, box.height / 2);
    await page.mouseMove(x, y);
    await page.mouseDown(x, y);
    const steps = 10;
    for (let step = 1; step <= steps; step += 1) await page.mouseMove(x + (dx * step) / steps, y, { modifiers: options.modifiers ?? [] });
    if (options.cancel) await page.press('Escape');
    await page.mouseUp(x + dx, y);
    await page.sleep(120);
  };

  // Étiquette du champ X : 40 px = 10 pas de 0,5.
  const startX = await value('#inspector-x');
  await drag('label:has(#inspector-x)', 40);
  check('glisser 40 px sur « X » ajoute 10 pas du champ (+5)', Math.abs((await value('#inspector-x')) - (startX + 5)) < 1e-6);

  await page.press('Control+z');
  await page.sleep(150);
  check('un glisser entier est un seul geste : un annuler rend la valeur de départ', Math.abs((await value('#inspector-x')) - startX) < 1e-6);

  // Maj accélère (×10), Alt affine (×0,1), pendant le glisser.
  const beforeFast = await value('#inspector-x');
  await drag('label:has(#inspector-x)', 40, { modifiers: ['Shift'] });
  check('un glisser avec Maj va plus vite que sans touche (bien au-delà de +5)', (await value('#inspector-x')) > beforeFast + 20);
  await page.press('Control+z');
  await page.sleep(120);
  const beforeFine = await value('#inspector-x');
  await drag('label:has(#inspector-x)', 40, { modifiers: ['Alt'] });
  check('un glisser avec Alt est dix fois plus fin (+0,5 au lieu de +5)', Math.abs((await value('#inspector-x')) - (beforeFine + 0.5)) < 1e-6);
  await page.press('Control+z');
  await page.sleep(120);

  // Échap pendant le glisser rend la valeur d'avant.
  const beforeCancel = await value('#inspector-x');
  await drag('label:has(#inspector-x)', 80, { cancel: true });
  check('Échap pendant un glisser rend la valeur d’avant', Math.abs((await value('#inspector-x')) - beforeCancel) < 1e-6);

  // Un simple clic sur l'étiquette ne change rien.
  await page.click('label:has(#inspector-x)');
  check('un clic sans glisser ne change pas la valeur', Math.abs((await value('#inspector-x')) - beforeCancel) < 1e-6);

  // Un tremblement de la main (2 px) reste un clic.
  await drag('label:has(#inspector-x)', 2);
  check('un déplacement de 2 px reste un clic : la valeur ne bouge pas', Math.abs((await value('#inspector-x')) - beforeCancel) < 1e-6);
  check('et il se comporte en clic : le champ prend le focus', await page.evaluate("document.activeElement?.id === 'inspector-x'"));

  // Clavier : Maj + flèche ×10, Alt + flèche ×0,1.
  await page.focus('#inspector-x');
  const key0 = await value('#inspector-x');
  await page.press('Shift+ArrowUp');
  await page.sleep(80);
  check('Maj + ↑ ajoute dix pas (+5)', Math.abs((await value('#inspector-x')) - (key0 + 5)) < 1e-6);
  await page.press('Alt+ArrowDown');
  await page.sleep(80);
  check('Alt + ↓ retire un dixième de pas (−0,05)', Math.abs((await value('#inspector-x')) - (key0 + 5 - 0.05)) < 1e-6);

  // Curseur d'opacité : l'étiquette du curseur règle le champ numérique associé.
  const opacity0 = await value('#inspector-opacity');
  await drag('label[for="inspector-opacity-range"]', -40);
  check('glisser sur « Opacité » baisse l’opacité (10 pas de 1 %)', Math.abs((await value('#inspector-opacity')) - (opacity0 - 10)) < 1e-6);

  // Réglage d'effet : l'étiquette précède le contrôle.
  const marked = await page.evaluate(`(() => {
    const label = [...document.querySelectorAll('label')].find((l) => l.nextElementSibling?.classList.contains('numeric-control') && l.getBoundingClientRect().width > 0);
    if (!label) return null;
    label.id = 'essai-etiquette';
    const field = label.nextElementSibling.querySelector('input[type=number]');
    field.id = 'essai-champ';
    return field.value;
  })()`);
  if (marked === null) {
    check('un réglage d’effet numérique est disponible pour l’essai', false);
  } else {
    const before = await value('#essai-champ');
    await drag('#essai-etiquette', 40);
    check('glisser sur l’étiquette d’un réglage d’effet change sa valeur', (await value('#essai-champ')) !== before);
  }

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
