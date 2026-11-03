// @ts-check
/**
 * The mask of a layer in the real Studio: a shape is chosen in the inspector, its settings are typed, and the preview carries the CSS mask of the instant on the real calque.
 * Switching shape keeps what matters, inverting changes the combination, removing the mask clears it, and undo gives it back.
 */
import { openStudio } from '../studio.js';

export const name = 'masque de couche';

const CALQUE = "([...document.getElementById('bg-layer').querySelectorAll('canvas')].filter((c) => c.parentElement.id !== 'bg-layer').at(-1).parentElement)";
const SHAPE = '#mask-body select';
const NUMBER = (/** @type {string} */ key) => `#mask-body [data-mask="${key}"] input[type="number"]`;

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  const style = (/** @type {string} */ property) => page.evaluate(`getComputedStyle(${CALQUE}).getPropertyValue(${JSON.stringify(property)})`);
  const visible = (/** @type {string} */ key) => page.evaluate(`!document.querySelector(${JSON.stringify(`#mask-body [data-mask="${key}"]`)}).hidden`);

  await page.click('#layers-add');
  await page.click('#gallery-grid [data-kind="text"]');
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Texte')", 8000);
  await page.sleep(400);

  check('a new layer has no mask: shape "none", no setting shown, no CSS mask', (await page.evaluate(`document.querySelector(${JSON.stringify(SHAPE)}).value`)) === 'none' && !(await visible('x')) && ((await style('mask-image')) === 'none' || (await style('mask-image')) === '') ? true : await style('mask-image'));

  await page.selectOption(SHAPE, 'ellipse');
  await page.sleep(150);
  check('choosing an ellipse shows its box settings and not the fade ones', (await visible('width')) && (await visible('feather')) && !(await visible('angle')) ? true : 'fields');
  check('the real calque carries a radial mask', (await style('mask-image')).includes('radial-gradient') ? true : await style('mask-image'));
  check('the settings start from the default ellipse (80 % wide, 20 % soft)', (await page.evaluate(`document.querySelector(${JSON.stringify(NUMBER('width'))}).value`)) === '80' && (await page.evaluate(`document.querySelector(${JSON.stringify(NUMBER('feather'))}).value`)) === '20');

  await page.fill(NUMBER('width'), 50);
  await page.sleep(150);
  check('typing 50 % for the width narrows the mask radius to 25 %', (await style('mask-image')).includes('25%') ? true : await style('mask-image'));

  await page.selectOption(SHAPE, 'rectangle');
  await page.sleep(150);
  const rect = await style('mask-image');
  check('a rectangle is two linear fades, kept where both show', rect.includes('linear-gradient(to right') && rect.split('linear-gradient(').length === 3 ? true : rect);

  await page.click('#mask-body [data-mask="invert"] input');
  await page.sleep(150);
  check('inverting a rectangle adds its two fades instead of intersecting them', (await style('mask-composite')).includes('add') ? true : await style('mask-composite'));
  await page.click('#mask-body [data-mask="invert"] input');

  await page.selectOption(SHAPE, 'linear');
  await page.sleep(150);
  check('a linear fade shows angle and stops only', (await visible('angle')) && (await visible('start')) && !(await visible('width')) ? true : 'fields');
  check('and the calque carries a linear mask at 90°', (await style('mask-image')).includes('linear-gradient(90deg') ? true : await style('mask-image'));

  await page.selectOption(SHAPE, 'none');
  await page.sleep(150);
  const none = await style('mask-image');
  check('"Aucun masque" clears it from the calque and hides the settings', (none === 'none' || none === '') && !(await visible('angle')) ? true : none);

  await page.click('#layers-undo');
  await page.sleep(150);
  check('undo gives the linear mask back', (await style('mask-image')).includes('linear-gradient(90deg') && (await page.evaluate(`document.querySelector(${JSON.stringify(SHAPE)}).value`)) === 'linear' ? true : await style('mask-image'));

  check('no error was reported by the page', errors.length === 0 ? true : errors.slice(0, 3));
}
