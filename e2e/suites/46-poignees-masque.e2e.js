// @ts-check
/**
 * Editing a mask on the preview with the real mouse: the toggle shows the box of an ellipse mask over the layer, dragging its body moves it, a handle resizes it, a linear fade shows
 * two lines that move along the gradient. Each gesture is one history step, and the CSS mask on the real calque follows.
 */
import { openStudio } from '../studio.js';

export const name = 'poignées de masque';

const CALQUE = "([...document.getElementById('bg-layer').querySelectorAll('canvas')].filter((c) => c.parentElement.id !== 'bg-layer').at(-1).parentElement)";
const NUMBER = (/** @type {string} */ key) => `#mask-body [data-mask="${key}"] input[type="number"]`;

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  const maskImage = () => page.evaluate(`getComputedStyle(${CALQUE}).getPropertyValue('mask-image')`);
  const value = (/** @type {string} */ key) => page.evaluate(`Number(document.querySelector(${JSON.stringify(NUMBER(key))}).value)`);
  const centre = async (/** @type {string} */ selector) => {
    const box = await page.boxOf(selector);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  async function dragBy(/** @type {{ x: number, y: number }} */ from, /** @type {number} */ dx, /** @type {number} */ dy) {
    await page.mouseDown(from.x, from.y);
    for (let step = 1; step <= 6; step += 1) await page.mouseMove(from.x + (dx * step) / 6, from.y + (dy * step) / 6);
    await page.mouseUp(from.x + dx, from.y + dy);
    await page.sleep(120);
  }

  await page.click('#layers-add');
  await page.click('#gallery-grid [data-kind="text"]');
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Texte')", 8000);
  await page.sleep(400);

  check('without a mask the "Éditer sur l’aperçu" toggle is hidden', await page.evaluate("document.getElementById('mask-edit-on-canvas').hidden"));
  await page.selectOption('#mask-body select', 'ellipse');
  await page.sleep(150);
  check('with a mask the toggle shows', await page.evaluate("!document.getElementById('mask-edit-on-canvas').hidden"));
  check('and the mask frame is not on the preview until it is switched on', await page.evaluate("document.querySelector('.co-mask').hidden"));
  await page.click('#mask-edit-on-canvas');
  check('switching it on shows the box with its eight handles', (await page.evaluate("!document.querySelector('.co-mask').hidden && document.querySelectorAll('.co-mask-handle').length")) === 8);

  // The preview is a 1920-wide source; the layer fills it, so one screen pixel is a known share of it.
  const frame = await page.boxOf('.co-mask');
  const x0 = await value('x');
  const w0 = await value('width');
  await dragBy(await centre('.co-mask-box'), frame.width * 0.1, 0);
  const x1 = await value('x');
  check('dragging the box moves it by the share of the frame it was dragged (+10 %)', Math.abs(x1 - x0 - 10) < 1.5 ? true : [x0, x1]);
  check('and the width did not change', (await value('width')) === w0);
  check('the real calque follows', (await maskImage()).includes('radial-gradient') ? true : await maskImage());

  const right = x1 + w0;
  await dragBy(await centre('[data-part="handle-w"]'), frame.width * 0.2, 0);
  const w1 = await value('width');
  check('dragging the west handle narrows the box by 20 %', Math.abs(w0 - w1 - 20) < 1.5 ? true : [w0, w1]);
  check('and keeps its right edge', Math.abs((await value('x')) + w1 - right) < 0.8 ? true : [right, await value('x'), w1]);

  await page.click('#layers-undo');
  await page.sleep(120);
  check('undo takes back the resize gesture only, in one step: the move before it stays', (await value('width')) === w0 && Math.abs((await value('x')) - x1) < 0.6 ? true : [w0, await value('width'), x1, await value('x')]);

  // Dragging in the empty part of the frame must not start a mask gesture: the box only is a target. A click on a handle must not select anything else.
  check('the layer stays selected after the gestures', (await page.evaluate("[...document.querySelectorAll('#layers-list .layer-row.is-selected')].length")) === 1);

  // Linear fade: two lines.
  await page.selectOption('#mask-body select', 'linear');
  await page.sleep(200);
  check('a linear fade shows two lines and no box', (await page.evaluate("[...document.querySelectorAll('.co-mask-stop')].filter((e) => !e.hidden).length")) === 2 && (await page.evaluate("document.querySelector('.co-mask-box').hidden")));
  const start0 = await value('start');
  const end0 = await value('end');
  await dragBy(await centre('[data-part="stop-start"]'), -frame.width * 0.15, 0);
  const start1 = await value('start');
  check('dragging the start line to the left (angle 90°) lowers the start by 15 %', Math.abs(start0 - start1 - 15) < 1.5 ? true : [start0, start1]);
  check('the end did not move', (await value('end')) === end0);
  await dragBy(await centre('[data-part="stop-end"]'), frame.width * 0.9, 0);
  check('the end line stops at the edge of the frame (100 %)', (await value('end')) === 100 ? true : await value('end'));

  // A turned layer: the mask turns with it, so a horizontal pointer movement moves the box along the layer's own vertical axis.
  await page.selectOption('#mask-body select', 'ellipse');
  await page.fill('#inspector-rotation', 90);
  await page.press('Tab');
  await page.sleep(250);
  const turnedX = await value('x');
  const turnedY = await value('y');
  const turnedFrame = await page.boxOf('.co-mask-box');
  await dragBy({ x: turnedFrame.x + turnedFrame.width / 2, y: turnedFrame.y + turnedFrame.height / 2 }, 60, 0);
  check('on a layer turned by 90°, a drag to the right moves the box up in the layer frame (and not sideways)', Math.abs((await value('x')) - turnedX) < 1 && (await value('y')) < turnedY - 3 ? true : [turnedX, turnedY, await value('x'), await value('y')]);

  // A group: its mask is drawn over the whole canvas, not over the box of its members.
  await page.fill('#inspector-rotation', 0);
  await page.press('Tab');
  await page.click('#layers-add');
  await page.click('#gallery-grid [data-kind="shape"]');
  await page.sleep(300);
  const rowOf = (/** @type {string} */ title) => page.evaluate(`[...document.querySelectorAll('#layers-list .layer-row')].findIndex((r) => r.querySelector('.layer-title').textContent === ${JSON.stringify(title)}) + 1`);
  // Both layers go to the top left quarter, so the box of the group is smaller than the canvas.
  for (const title of ['Forme', 'Texte']) {
    await page.click(`#layers-list .layer-row:nth-child(${await rowOf(title)})`);
    await page.selectOption('#inspector-preset', 'corner-tl');
    await page.sleep(150);
  }
  await page.click(`#layers-list .layer-row:nth-child(${await rowOf('Forme')})`);
  await page.click(`#layers-list .layer-row:nth-child(${await rowOf('Texte')})`, { modifiers: ['Control'] });
  await page.click('#layers-group');
  await page.sleep(300);
  await page.selectOption('#mask-body select', 'ellipse');
  await page.sleep(300);
  const groupFrame = await page.boxOf('.co-mask');
  const stageBox = await page.boxOf('#bg-layer');
  check('the mask of a group is drawn over the whole canvas', Math.abs(groupFrame.width - stageBox.width) < 2 && Math.abs(groupFrame.height - stageBox.height) < 2 ? true : [groupFrame, stageBox]);

  await page.click('#mask-edit-on-canvas');
  check('switching it off hides the frame again', await page.evaluate("document.querySelector('.co-mask').hidden"));
  check('no error was reported by the page', errors.length === 0 ? true : errors.slice(0, 3));
}
